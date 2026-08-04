import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";

import type { MonitorObservation } from "@velvet/monitor";

const cliModule = import("../src/cli.js").catch(() => ({}));

test("reapplies the same observations once after a safe data conflict", async () => {
  const module = (await cliModule) as Record<string, unknown>;
  if (typeof module.runMonitorCli !== "function") {
    assert.fail("@velvet/monitor-action must export runMonitorCli");
  }
  const workspace = await mkdtemp(join(tmpdir(), "velvet-cli-"));
  const summaries: Array<Record<string, unknown>> = [];
  const observations: MonitorObservation[] = [
    {
      serviceId: "website",
      checkId: "website",
      checkedAt: "2026-07-29T12:00:00.000Z",
      targetAvailability: "available",
      responseTimeMs: 100,
      statusCode: 200,
      failureCode: null,
      attempts: 1,
    },
  ];
  const snapshots = [
    {
      revision: "a".repeat(40),
      oldestCommitAt: "2026-07-29T11:00:00.000Z",
      state: null,
      incidents: null,
    },
    {
      revision: "b".repeat(40),
      oldestCommitAt: "2026-07-29T11:00:00.000Z",
      state: null,
      incidents: null,
    },
  ];
  let runnerCalls = 0;
  let publishCalls = 0;
  try {
    await writeFile(
      join(workspace, "velvet.yml"),
      "schemaVersion: 1\n" +
        "repository: { owner: example, name: status }\n" +
        "statusPage: { name: Example Status }\n" +
        "services:\n" +
        "  - { name: Website, url: https://example.com }\n",
      "utf8",
    );
    const runMonitorCli = module.runMonitorCli as (
      environment: Record<string, string>,
      dependencies: Record<string, unknown>,
    ) => Promise<{ commitOutcome: string }>;
    const result = await runMonitorCli(
      {
        VELVET_MODE: "status",
        VELVET_WORKSPACE: workspace,
        GITHUB_REPOSITORY: "example/status",
        GITHUB_RUN_ID: "123",
        GITHUB_TOKEN: "test-token",
      },
      {
        loadDataBranch: async () => snapshots.shift(),
        runMonitorAction: async (
          _input: unknown,
          dependencies: {
            executeChecks?: () => Promise<MonitorObservation[]>;
          },
        ) => {
          runnerCalls += 1;
          if (runnerCalls === 2) {
            assert.deepEqual(await dependencies.executeChecks?.(), observations);
          }
          return {
            outcome: "prepared",
            run: {
              id: "123:status",
              kind: "uptime",
              startedAt: "2026-07-29T12:00:00.000Z",
              completedAt: "2026-07-29T12:00:01.000Z",
            },
            content: {},
            incidents: { schemaVersion: 1, generatedAt: "2026-07-29T12:00:01.000Z", events: [] },
            observations,
            summary: {
              mode: "status",
              outcome: "prepared",
              availableChecks: 1,
              unavailableChecks: 0,
              incidentResult: "reconciled",
            },
          };
        },
        publishDataBranch: async () => {
          publishCalls += 1;
          if (publishCalls === 1) {
            throw Object.assign(new Error("conflict"), {
              code: "DATA_BRANCH_CONFLICT",
            });
          }
          return {
            outcome: "written",
            revision: "c".repeat(40),
            compacted: false,
          };
        },
        createIncidentClient: () => ({}),
        writeActionSummary: async (
          _path: string | undefined,
          summary: Record<string, unknown>,
        ) => {
          summaries.push(summary);
        },
      },
    );

    assert.equal(result.commitOutcome, "written");
    assert.equal(runnerCalls, 2);
    assert.equal(publishCalls, 2);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.commitOutcome, "written");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("a configuration that cannot be read is not reported as an invalid one", async () => {
  // A configuration that cannot be read and one that is invalid are different
  // faults with different repairs, so they carry different codes. Sharing one
  // makes them indistinguishable in a run's output, and a reader then looks for
  // a schema error where the file was never opened.
  const module = (await cliModule) as Record<string, unknown>;
  if (typeof module.runMonitorCli !== "function") {
    assert.fail("@velvet/monitor-action must export runMonitorCli");
  }
  const workspace = await mkdtemp(join(tmpdir(), "velvet-cli-"));
  try {
    // No velvet.yml is written at all.
    await assert.rejects(
      () =>
        (module.runMonitorCli as (environment: Record<string, string>) => Promise<unknown>)({
          VELVET_MODE: "status",
          VELVET_WORKSPACE: workspace,
          GITHUB_REPOSITORY: "example/status",
          GITHUB_RUN_ID: "1",
          GITHUB_TOKEN: "token",
        }),
      (error: unknown) => {
        const failure = error as { code?: string; detail?: string | null };
        assert.equal(failure.code, "CONFIGURATION_UNREADABLE");
        assert.equal(failure.detail, null, "an unreadable file has no location");
        return true;
      },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("a refused configuration names the path the validator rejected", async () => {
  const module = (await cliModule) as Record<string, unknown>;
  if (typeof module.runMonitorCli !== "function") {
    assert.fail("@velvet/monitor-action must export runMonitorCli");
  }
  const workspace = await mkdtemp(join(tmpdir(), "velvet-cli-"));
  try {
    // Valid YAML, but history.retentionDays is far outside what the schema
    // allows, so the validator refuses it and can say where.
    await writeFile(
      join(workspace, "velvet.yml"),
      [
        "schemaVersion: 1",
        "repository:",
        "  owner: example",
        "  name: status",
        "statusPage:",
        "  name: Example",
        "services:",
        "  - name: Website",
        "    url: https://example.com/",
        "history:",
        "  retentionDays: -5",
        "",
      ].join("\n"),
      "utf8",
    );
    await assert.rejects(
      () =>
        (module.runMonitorCli as (environment: Record<string, string>) => Promise<unknown>)({
          VELVET_MODE: "status",
          VELVET_WORKSPACE: workspace,
          GITHUB_REPOSITORY: "example/status",
          GITHUB_RUN_ID: "1",
          GITHUB_TOKEN: "token",
        }),
      (error: unknown) => {
        const failure = error as { code?: string; detail?: string | null };
        assert.equal(failure.code, "INVALID_CONFIGURATION");
        assert.equal(
          typeof failure.detail,
          "string",
          "the rejected path is the one thing that says what to correct",
        );
        assert.match(failure.detail!, /retentionDays|history/u);
        return true;
      },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
