import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "bun:test";

import {
  createGitHubIssuesClient,
  parseVelvetMetadata,
  type GitHubIssue,
} from "@velvet/github-incidents";
import type { MonitorObservation } from "@velvet/monitor";

import { runMonitorCli } from "../src/cli.js";
import {
  loadDataBranch,
  publishDataBranch,
} from "../src/data-branch.js";
import { runMonitorAction } from "../src/runner.js";

const repository = process.env.VELVET_GITHUB_INTEGRATION_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const explicitlyIsolated =
  process.env.VELVET_GITHUB_INTEGRATION_ISOLATED === "true";
const dispatchEnabled =
  process.env.VELVET_GITHUB_INTEGRATION_DISPATCH === "true";
const executeFile = promisify(execFile);

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function api(
  owner: string,
  repo: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`,
      {
        ...init,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2026-03-10",
          ...(method === "GET" ? { "cache-control": "no-cache" } : {}),
          ...(init.body === undefined
            ? {}
            : { "content-type": "application/json" }),
        },
      },
    );
    if (response.ok) return response;
    if (
      method === "GET" &&
      [502, 503, 504].includes(response.status) &&
      attempt < 2
    ) {
      await delay(1_000);
      continue;
    }
    throw new Error(
      `GitHub integration ${method} ${path} failed with ${response.status}.`,
    );
  }
  throw new Error(`GitHub integration ${method} ${path} failed.`);
}

async function cloneRepository(
  owner: string,
  repo: string,
  destination: string,
): Promise<void> {
  const authorization = Buffer.from(`x-access-token:${token}`).toString(
    "base64",
  );
  const authEnvironment = {
    ...process.env,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authorization}`,
    GIT_TERMINAL_PROMPT: "0",
  };
  await executeFile(
    "git",
    ["clone", `https://github.com/${owner}/${repo}.git`, destination],
    { env: authEnvironment },
  );
  await executeFile(
    "git",
    [
      "config",
      "http.https://github.com/.extraheader",
      `AUTHORIZATION: basic ${authorization}`,
    ],
    { cwd: destination },
  );
}

async function dispatchAndWait(
  owner: string,
  repo: string,
  workflow: string,
): Promise<void> {
  const dispatchedAt = Date.now();
  await api(owner, repo, `/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main" }),
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await api(
      owner,
      repo,
      `/actions/workflows/${workflow}/runs?event=workflow_dispatch&per_page=10`,
    );
    const document = (await response.json()) as {
      workflow_runs?: Array<{
        created_at: string;
        status: string;
        conclusion: string | null;
      }>;
    };
    const run = document.workflow_runs?.find(
      ({ created_at }) => Date.parse(created_at) >= dispatchedAt - 1_000,
    );
    if (run?.status === "completed") {
      assert.equal(run.conclusion, "success");
      return;
    }
    await delay(2_000);
  }
  assert.fail("The dispatched Velvet workflow did not complete.");
}

async function waitForIssues(
  client: ReturnType<typeof createGitHubIssuesClient>,
  label: string,
  matches: (issue: GitHubIssue) => boolean,
): Promise<GitHubIssue[]> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const issues = (await client.listIssues(label)).filter(matches);
    if (issues.length > 0) return issues;
    await delay(1_000);
  }
  return [];
}

test.skipIf(
  !repository || !token || !explicitlyIsolated || !dispatchEnabled,
)(
  "runs status, response, maintenance, conflict, and dispatch in the isolated repository",
  async () => {
    assert.ok(repository);
    assert.ok(token);
    assert.match(repository, /integration/iu);
    const [owner, repo, extra] = repository.split("/");
    assert.ok(owner && repo && extra === undefined);
    const root = await mkdtemp(join(tmpdir(), "velvet-github-action-"));
    const firstWorkspace = join(root, "first");
    const secondWorkspace = join(root, "second");
    const identity = randomUUID().replaceAll("-", "").slice(0, 12);
    const serviceId = `it-${identity}`;
    const incidentLabel = `velvet-it-${identity}-incident`;
    const maintenanceLabel = `velvet-it-${identity}-maintenance`;
    const client = createGitHubIssuesClient({ owner, repo, token });
    const ownedIssues: GitHubIssue[] = [];
    const configuration = `
schemaVersion: 1
repository: { owner: ${owner}, name: ${repo} }
statusPage: { name: Velvet Integration }
services:
  - id: ${serviceId}
    name: Velvet integration ${identity}
    url: http://127.0.0.1:1
incidents:
  failureThreshold: 1
  recoveryThreshold: 1
  incidentLabel: ${incidentLabel}
  maintenanceLabel: ${maintenanceLabel}
history: { retentionDays: 1 }
`;

    try {
      await cloneRepository(owner, repo, firstWorkspace);
      await writeFile(join(firstWorkspace, "velvet.yml"), configuration, "utf8");
      const environment = (mode: "status" | "response", runId: string) => ({
        VELVET_MODE: mode,
        VELVET_WORKSPACE: firstWorkspace,
        GITHUB_REPOSITORY: repository,
        GITHUB_RUN_ID: runId,
        GITHUB_TOKEN: token,
      });

      await runMonitorCli(environment("status", `${identity}-status-1`));
      const incidents = await waitForIssues(
        client,
        incidentLabel,
        ({ body }) => {
          const metadata = parseVelvetMetadata(body);
          return (
            metadata?.kind === "incident" && metadata.serviceId === serviceId
          );
        },
      );
      ownedIssues.push(...incidents);
      assert.equal(incidents.length, 1);

      const startsAt = new Date(Date.now() + 600_000).toISOString();
      const endsAt = new Date(Date.now() + 1_200_000).toISOString();
      await client.ensureLabel({
        name: maintenanceLabel,
        color: "fbca04",
        description: "Velvet isolated integration maintenance",
      });
      const maintenance = await client.createIssue({
        title: `[Maintenance] Velvet integration ${identity}`,
        body:
          `### Affected services and checks\n\n- Velvet integration ${identity} [${serviceId}/${serviceId}]\n\n` +
          `### Starts at\n\n${startsAt}\n\n### Ends at\n\n${endsAt}\n\n` +
          "### Summary\n\nIsolated Velvet integration maintenance.",
        labels: [maintenanceLabel],
      });
      ownedIssues.push(maintenance);
      const maintenanceObserver = createGitHubIssuesClient({
        owner,
        repo,
        token,
      });
      const visibleMaintenance = await waitForIssues(
        maintenanceObserver,
        maintenanceLabel,
        ({ number }) => number === maintenance.number,
      );
      assert.equal(visibleMaintenance.length, 1);
      await runMonitorCli(environment("status", `${identity}-status-2`));
      const beforeResponse = await loadDataBranch(firstWorkspace);
      assert.equal(
        beforeResponse.incidents?.events.some(
          ({ id }) => id === `maintenance-${maintenance.number}`,
        ),
        true,
      );

      await runMonitorCli(environment("response", `${identity}-response`));
      const afterResponse = await loadDataBranch(firstWorkspace);
      assert.deepEqual(
        afterResponse.state?.documents.status,
        beforeResponse.state?.documents.status,
      );

      await cloneRepository(owner, repo, secondWorkspace);
      await writeFile(join(secondWorkspace, "velvet.yml"), configuration, "utf8");
      const firstBase = await loadDataBranch(firstWorkspace);
      const secondBase = await loadDataBranch(secondWorkspace);
      const checkedAt = new Date().toISOString();
      const fixedObservations: MonitorObservation[] = [
        {
          serviceId,
          checkId: serviceId,
          checkedAt,
          targetAvailability: "unavailable",
          responseTimeMs: null,
          statusCode: null,
          failureCode: "CONNECTION_ERROR",
          attempts: 2,
        },
      ];
      const prepare = (workspace: string, base: typeof firstBase, suffix: string) =>
        runMonitorAction(
          {
            mode: "status",
            runId: `${identity}-conflict-${suffix}`,
            repository,
            configurationSource: configuration,
            currentState: base.state,
            currentIncidents: base.incidents,
          },
          {
            executeChecks: async () => fixedObservations,
            incidentClient: client,
            writeSummary: async () => undefined,
          },
        ).then((result) => ({ workspace, result }));
      const [firstCandidate, secondCandidate] = await Promise.all([
        prepare(firstWorkspace, firstBase, "first"),
        prepare(secondWorkspace, secondBase, "second"),
      ]);
      assert.equal(firstCandidate.result.outcome, "prepared");
      assert.equal(secondCandidate.result.outcome, "prepared");
      if (
        firstCandidate.result.outcome !== "prepared" ||
        secondCandidate.result.outcome !== "prepared"
      ) {
        return;
      }
      await publishDataBranch(firstWorkspace, firstBase, {
        run: firstCandidate.result.run,
        content: firstCandidate.result.content,
        incidents: firstCandidate.result.incidents,
        retentionDays: 1,
      });
      await assert.rejects(
        publishDataBranch(secondWorkspace, secondBase, {
          run: secondCandidate.result.run,
          content: secondCandidate.result.content,
          incidents: secondCandidate.result.incidents,
          retentionDays: 1,
        }),
        (error: unknown) =>
          error instanceof Error &&
          "code" in error &&
          error.code === "DATA_BRANCH_CONFLICT",
      );

      await dispatchAndWait(owner, repo, "velvet-status.yml");
      await dispatchAndWait(owner, repo, "velvet-response-times.yml");
    } finally {
      for (const ownedIssue of ownedIssues) {
        const current = [
          ...(await client.listIssues(incidentLabel)),
          ...(await client.listIssues(maintenanceLabel)),
        ].find(({ number }) => number === ownedIssue.number);
        if (current?.state === "open") {
          await client.createComment(
            current.number,
            "Closing this isolated Velvet integration-test issue after the test run.",
          );
          await client.updateIssue(current.number, { state: "closed" });
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  },
  180_000,
);
