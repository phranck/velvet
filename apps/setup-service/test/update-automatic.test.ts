import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "bun:test";

import { buildReleaseManifest } from "@velvet/template-files";

import {
  createAutomaticUpdateRunner,
  type AutomaticUpdateLogEntry,
} from "../src/update-automatic.js";
import type {
  ManagedUpdateOrchestrator,
  ManagedUpdateRelease,
  ManagedUpdateReleaseProvider,
  ManagedUpdateRequest,
} from "../src/update-orchestrator-types.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
const privateKeyPem = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

const TEMPLATE_COMMIT = "a".repeat(40);
const LOCK_PATH = /^\/repos\/[^/]+\/([^/]+)\/contents\/velvet\.lock\.json$/u;

function monitorWorkflow(): string {
  return `
name: Velvet
on: { workflow_dispatch: {} }
jobs:
  monitor:
    steps:
      - uses: phranck/velvet/actions/monitor@${"c".repeat(40)}
`;
}

const sources: Record<string, string> = {
  ".github/ISSUE_TEMPLATE/config.yml": "blank_issues_enabled: false\n",
  ".github/ISSUE_TEMPLATE/maintenance.yml": `
name: Planned maintenance
body:
  - type: dropdown
    id: affected-targets
    attributes:
      options: [Placeholder]
`,
  ".github/workflows/deploy-announce.yml": "name: Deploy announce\n",
  ".github/workflows/maintenance-switch.yml": `
name: Maintenance switch
on:
  workflow_dispatch:
    inputs:
      services: { default: placeholder }
jobs: {}
`,
  ".github/workflows/velvet-response-times.yml": monitorWorkflow(),
  ".github/workflows/velvet-status.yml": monitorWorkflow(),
  ".github/workflows/velvet-update-check.yml": "name: Velvet update check\n",
  ".github/workflows/velvet.yml": monitorWorkflow(),
};

/** A release the publication rules accept, classified as asked for. */
function release(
  version: string,
  options: { security: boolean; automatic: boolean },
): ManagedUpdateRelease {
  const built = buildReleaseManifest({
    version,
    releaseType: options.security ? "security" : "feature",
    automaticInstallEligible: options.automatic,
    compatibility: {
      minimumInstalledVersion: "2.0.0",
      configurationSchemaVersion: 1,
      dataSchemaVersion: 1,
      configurationMigrationRequired: false,
      dataMigrationRequired: false,
    },
    releaseNotes: `# Velvet ${version}\n`,
    source: {
      repository: "phranck/velvet",
      commit: TEMPLATE_COMMIT,
      files: sources,
    },
  });
  assert.equal(built.success, true, `release ${version} must be publishable`);
  if (!built.success) throw new Error("unreachable");
  return { manifest: built.data, sources };
}

function releases(entry: ManagedUpdateRelease): ManagedUpdateReleaseProvider {
  return {
    latest: () => entry.manifest.version,
    get: async () => entry,
  };
}

const LOCK = {
  schemaVersion: 1,
  installedVersion: "2.0.0",
  template: { repository: "phranck/velvet", commit: TEMPLATE_COMMIT },
  configurationSchemaVersion: 1,
  dataSchemaVersion: 1,
};

interface Harness {
  run: ReturnType<typeof createAutomaticUpdateRunner>["run"];
  requested: ManagedUpdateRequest[];
  paths: string[];
  logs: AutomaticUpdateLogEntry[];
}

/**
 * Serves the endpoints a sweep reads and records every path it asked for.
 *
 * Recording the paths is how "no eligible release means no GitHub request" is
 * proven, rather than inferred from a counter the code under test keeps.
 */
function harness(input: {
  entry: ManagedUpdateRelease;
  installations?: number[];
  repositories?: { id: number; owner: string; name: string }[];
  locked?: number[];
  reconcile?: (request: ManagedUpdateRequest) => Promise<never>;
}): Harness {
  const requested: ManagedUpdateRequest[] = [];
  const paths: string[] = [];
  const logs: AutomaticUpdateLogEntry[] = [];
  const installations = input.installations ?? [7];
  const repositories = input.repositories ?? [
    { id: 9, owner: "example", name: "status" },
  ];
  const locked = new Set(input.locked ?? repositories.map(({ id }) => id));

  const orchestrator: ManagedUpdateOrchestrator = {
    async reconcile(request) {
      requested.push(request);
      if (input.reconcile) return input.reconcile(request);
      return {
        operationId: `repository:${request.repositoryId}:velvet:${request.version}`,
        version: request.version,
        trigger: request.trigger,
        state: "waiting_for_checks",
      };
    },
  };

  const runner = createAutomaticUpdateRunner({
    app: {
      appId: "12345",
      privateKey: privateKeyPem,
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        paths.push(path);
        if (path === "/app/installations") {
          return Response.json(installations.map((id) => ({ id })));
        }
        if (path.endsWith("/access_tokens")) {
          return Response.json({ token: "installation-token" });
        }
        if (path === "/installation/repositories") {
          return Response.json({
            total_count: repositories.length,
            repositories: repositories.map((entry) => ({
              id: entry.id,
              name: entry.name,
              owner: { login: entry.owner },
            })),
          });
        }
        const lock = path.match(LOCK_PATH);
        if (lock) {
          const found = repositories.find(({ name }) => name === lock[1]);
          if (!found || !locked.has(found.id)) {
            return new Response("{}", { status: 404 });
          }
          return Response.json({
            type: "file",
            encoding: "base64",
            content: Buffer.from(JSON.stringify(LOCK), "utf8").toString("base64"),
          });
        }
        return new Response("{}", { status: 404 });
      },
    },
    releases: releases(input.entry),
    orchestrator,
    log: (entry) => logs.push(entry),
  });

  return { run: runner.run, requested, paths, logs };
}

test("touches GitHub not at all whilst no release may install itself", async () => {
  for (const options of [
    { security: false, automatic: false },
    { security: true, automatic: false },
  ]) {
    const velvet = harness({ entry: release("2.0.1", options) });

    const sweep = await velvet.run();

    assert.equal(sweep.eligible, false, JSON.stringify(options));
    assert.deepEqual(velvet.paths, [], "the cheap question is asked first");
    assert.deepEqual(velvet.requested, []);
    // Touching nothing is not the same as having nothing to say. Without this
    // line a sweep that ran and found nothing to do reads exactly like a
    // schedule that stopped firing, which is the ordinary case for weeks on
    // end whilst no eligible security release exists.
    assert.deepEqual(
      velvet.logs,
      [
        {
          scope: "sweep",
          version: "2.0.1",
          eligible: false,
          installations: 0,
          repositories: 0,
          reconciled: 0,
          failures: 0,
          truncated: false,
        },
      ],
      JSON.stringify(options),
    );
  }
});

test("reports one summary for a sweep that did reach installations", async () => {
  const velvet = harness({
    entry: release("2.0.1", { security: true, automatic: true }),
  });

  await velvet.run();

  const summaries = velvet.logs.filter((entry) => entry.scope === "sweep");
  assert.equal(summaries.length, 1, "one line per sweep, never more");
  assert.deepEqual(summaries[0], {
    scope: "sweep",
    version: "2.0.1",
    eligible: true,
    installations: 1,
    repositories: 1,
    reconciled: 1,
    failures: 0,
    truncated: false,
  });
});

test("reconciles every installation that carries a version lock", async () => {
  const velvet = harness({
    entry: release("2.0.1", { security: true, automatic: true }),
    repositories: [
      { id: 9, owner: "example", name: "status" },
      { id: 11, owner: "example", name: "notes" },
    ],
    locked: [9],
  });

  const sweep = await velvet.run();

  assert.equal(sweep.eligible, true);
  assert.equal(sweep.repositories, 2);
  assert.deepEqual(velvet.requested, [
    {
      installationId: 7,
      repositoryId: 9,
      version: "2.0.1",
      trigger: "automatic-security",
    },
  ]);
  assert.equal(
    velvet.logs.filter(
      (entry) => entry.scope === "repository" && entry.outcome === "skipped",
    ).length,
    1,
    "a repository that is not a Velvet installation is passed over quietly",
  );
});

test("leaves the owner's preference to the orchestrator", async () => {
  // Deciding here as well would mean two places could disagree about whether
  // somebody wanted this.
  const velvet = harness({
    entry: release("2.0.1", { security: true, automatic: true }),
    reconcile: async (request) =>
      ({
        operationId: `repository:${request.repositoryId}:velvet:${request.version}`,
        version: request.version,
        trigger: request.trigger,
        state: "skipped",
        reason: "automatic_security_disabled",
      }) as never,
  });

  const sweep = await velvet.run();

  assert.equal(sweep.reconciled[0]?.reason, "automatic_security_disabled");
  assert.equal(sweep.failures, 0, "a declined update is not a failure");
});

test("keeps going when one repository fails", async () => {
  const velvet = harness({
    entry: release("2.0.1", { security: true, automatic: true }),
    repositories: [
      { id: 9, owner: "example", name: "status" },
      { id: 11, owner: "example", name: "second" },
    ],
    reconcile: async (request) => {
      if (request.repositoryId === 9) throw new Error("upstream failure");
      return {
        operationId: `repository:${request.repositoryId}:velvet:${request.version}`,
        version: request.version,
        trigger: request.trigger,
        state: "waiting_for_checks",
      } as never;
    },
  });

  const sweep = await velvet.run();

  assert.equal(sweep.failures, 1);
  assert.equal(sweep.reconciled.length, 1);
  assert.deepEqual(
    velvet.requested.map(({ repositoryId }) => repositoryId),
    [9, 11],
  );
});

test("stops retrying a release that keeps failing for one repository", async () => {
  const velvet = harness({
    entry: release("2.0.1", { security: true, automatic: true }),
    reconcile: async () => {
      throw new Error("upstream failure");
    },
  });

  for (let sweepIndex = 0; sweepIndex < 3; sweepIndex += 1) {
    await velvet.run();
  }
  const abandoning = await velvet.run();

  assert.equal(velvet.requested.length, 3, "three attempts, then no more");
  assert.equal(abandoning.failures, 0);
  assert.equal(
    velvet.logs.some(
      (entry) => entry.scope === "repository" && entry.outcome === "abandoned",
    ),
    true,
  );
});

test("logs what it did without carrying a token", async () => {
  const velvet = harness({
    entry: release("2.0.1", { security: true, automatic: true }),
  });

  await velvet.run();

  assert.deepEqual(
    velvet.logs.filter((entry) => entry.scope === "repository"),
    [
      {
        scope: "repository",
        installationId: 7,
        repositoryId: 9,
        version: "2.0.1",
        outcome: "reconciled",
        state: "waiting_for_checks",
      },
    ],
  );
  assert.equal(
    JSON.stringify(velvet.logs).includes("installation-token"),
    false,
    "no line carries the token, the summary included",
  );
});

test("does not start a second sweep whilst one is running", async () => {
  const velvet = harness({
    entry: release("2.0.1", { security: true, automatic: true }),
  });

  const [first, second] = await Promise.all([velvet.run(), velvet.run()]);

  assert.deepEqual(first, second);
  assert.equal(velvet.requested.length, 1);
});
