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
