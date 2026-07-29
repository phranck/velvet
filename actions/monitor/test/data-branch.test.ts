import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, test } from "bun:test";

import type { IncidentsDocument } from "@velvet/contracts";
import type {
  MonitorRun,
  MonitorStateContent,
} from "@velvet/monitor";

type DataBranchSnapshot = {
  revision: string | null;
  oldestCommitAt: string | null;
  state: null | { processedRuns: MonitorRun[] };
  incidents: IncidentsDocument | null;
};

type PublishResult = {
  outcome: "written" | "duplicate" | "stale";
  revision: string | null;
  compacted: boolean;
};

const dataBranchModule = import("../src/data-branch.js").catch(() => ({}));
const executeFile = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function dataBranchFunctions(): Promise<{
  loadDataBranch: (workspace: string) => Promise<DataBranchSnapshot>;
  publishDataBranch: (
    workspace: string,
    base: DataBranchSnapshot,
    input: {
      run: MonitorRun;
      content: MonitorStateContent;
      incidents: IncidentsDocument;
      retentionDays: number;
    },
  ) => Promise<PublishResult>;
}> {
  const module = (await dataBranchModule) as Record<string, unknown>;
  for (const name of ["loadDataBranch", "publishDataBranch"]) {
    if (typeof module[name] !== "function") {
      assert.fail(`@velvet/monitor-action must export ${name}`);
    }
  }
  return module as Awaited<ReturnType<typeof dataBranchFunctions>>;
}

async function git(directory: string, ...arguments_: string[]): Promise<string> {
  const result = await executeFile("git", arguments_, { cwd: directory });
  return result.stdout.trim();
}

async function fixtureRepository(): Promise<{
  remote: string;
  workspace: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "velvet-monitor-data-"));
  temporaryDirectories.push(root);
  const remote = join(root, "consumer.git");
  const workspace = join(root, "consumer");
  await executeFile("git", ["init", "--bare", "--initial-branch=main", remote]);
  await mkdir(workspace);
  await git(workspace, "init", "--initial-branch=main");
  await git(workspace, "config", "user.name", "Fixture Author");
  await git(workspace, "config", "user.email", "fixture@example.invalid");
  await writeFile(join(workspace, "velvet.yml"), "schemaVersion: 1\n", "utf8");
  await git(workspace, "add", "velvet.yml");
  await git(workspace, "commit", "-m", "Initial fixture");
  await git(workspace, "remote", "add", "origin", remote);
  await git(workspace, "push", "--set-upstream", "origin", "main");
  return { remote, workspace };
}

function run(id: string, timestamp: string): MonitorRun {
  return {
    id,
    kind: "uptime",
    startedAt: timestamp,
    completedAt: timestamp,
  };
}

function content(
  timestamp: string,
  monitoringStartedAt = timestamp,
): MonitorStateContent {
  return {
    monitoringStartedAt,
    current: { checks: [], services: [] },
    stateChanges: [],
    importedDailyAvailability: [],
    maintenanceWindows: [],
    responseSamples: [],
    documents: {
      status: {
        schemaVersion: 1,
        generatedAt: timestamp,
        monitoringStartedAt,
        services: [],
      },
      responseTimes: {
        schemaVersion: 1,
        generatedAt: timestamp,
        monitoringStartedAt,
        series: [],
      },
    },
  };
}

function incidents(timestamp: string): IncidentsDocument {
  return { schemaVersion: 1, generatedAt: timestamp, events: [] };
}

test("bootstraps an exact four-file data branch without changing main", async () => {
  const { loadDataBranch, publishDataBranch } = await dataBranchFunctions();
  const { remote, workspace } = await fixtureRepository();
  const mainBefore = await git(workspace, "rev-parse", "main");
  const timestamp = "2026-07-29T12:00:00.000Z";
  const base = await loadDataBranch(workspace);

  assert.deepEqual(base, {
    revision: null,
    oldestCommitAt: null,
    state: null,
    incidents: null,
  });

  const result = await publishDataBranch(workspace, base, {
    run: run("123:status", timestamp),
    content: content(timestamp),
    incidents: incidents(timestamp),
    retentionDays: 365,
  });

  assert.equal(result.outcome, "written");
  assert.equal(result.compacted, false);
  assert.equal(await git(workspace, "rev-parse", "main"), mainBefore);
  assert.equal(await git(remote, "rev-list", "--count", "velvet-data"), "1");
  assert.deepEqual(
    (await git(remote, "ls-tree", "-r", "--name-only", "velvet-data")).split(
      "\n",
    ),
    [
      ".velvet/monitor-state.json",
      "velvet-data/v1/incidents.json",
      "velvet-data/v1/response-times.json",
      "velvet-data/v1/status.json",
    ],
  );
});

test("writes one commit per new run and skips an exact rerun", async () => {
  const { loadDataBranch, publishDataBranch } = await dataBranchFunctions();
  const { remote, workspace } = await fixtureRepository();
  const firstTimestamp = "2026-07-29T12:00:00.000Z";
  await publishDataBranch(workspace, await loadDataBranch(workspace), {
    run: run("123:status", firstTimestamp),
    content: content(firstTimestamp),
    incidents: incidents(firstTimestamp),
    retentionDays: 365,
  });

  const secondTimestamp = "2026-07-29T12:05:00.000Z";
  const secondInput = {
    run: run("124:status", secondTimestamp),
    content: content(secondTimestamp, firstTimestamp),
    incidents: incidents(secondTimestamp),
    retentionDays: 365,
  };
  const written = await publishDataBranch(
    workspace,
    await loadDataBranch(workspace),
    secondInput,
  );
  const duplicate = await publishDataBranch(
    workspace,
    await loadDataBranch(workspace),
    secondInput,
  );

  assert.equal(written.outcome, "written");
  assert.equal(duplicate.outcome, "duplicate");
  assert.equal(await git(remote, "rev-list", "--count", "velvet-data"), "2");
});

test("rejects a stale base without overwriting the newer snapshot", async () => {
  const { loadDataBranch, publishDataBranch } = await dataBranchFunctions();
  const { remote, workspace } = await fixtureRepository();
  const firstTimestamp = "2026-07-29T12:00:00.000Z";
  await publishDataBranch(workspace, await loadDataBranch(workspace), {
    run: run("123:status", firstTimestamp),
    content: content(firstTimestamp),
    incidents: incidents(firstTimestamp),
    retentionDays: 365,
  });
  const sharedBase = await loadDataBranch(workspace);
  const secondTimestamp = "2026-07-29T12:05:00.000Z";
  const newer = await publishDataBranch(workspace, sharedBase, {
    run: run("124:status", secondTimestamp),
    content: content(secondTimestamp, firstTimestamp),
    incidents: incidents(secondTimestamp),
    retentionDays: 365,
  });

  await assert.rejects(
    publishDataBranch(workspace, sharedBase, {
      run: run("125:status", "2026-07-29T12:06:00.000Z"),
      content: content("2026-07-29T12:06:00.000Z", firstTimestamp),
      incidents: incidents("2026-07-29T12:06:00.000Z"),
      retentionDays: 365,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "DATA_BRANCH_CONFLICT",
  );

  assert.equal(await git(remote, "rev-parse", "velvet-data"), newer.revision);
  assert.equal(await git(remote, "rev-list", "--count", "velvet-data"), "2");
});

test("does not publish a run older than the newest stored run", async () => {
  const { loadDataBranch, publishDataBranch } = await dataBranchFunctions();
  const { remote, workspace } = await fixtureRepository();
  const newestTimestamp = "2026-07-29T12:05:00.000Z";
  await publishDataBranch(workspace, await loadDataBranch(workspace), {
    run: run("124:status", newestTimestamp),
    content: content(newestTimestamp),
    incidents: incidents(newestTimestamp),
    retentionDays: 365,
  });
  const stale = await publishDataBranch(
    workspace,
    await loadDataBranch(workspace),
    {
      run: run("123:status", "2026-07-29T12:00:00.000Z"),
      content: content("2026-07-29T12:00:00.000Z", newestTimestamp),
      incidents: incidents("2026-07-29T12:00:00.000Z"),
      retentionDays: 365,
    },
  );

  assert.equal(stale.outcome, "stale");
  assert.equal(await git(remote, "rev-list", "--count", "velvet-data"), "1");
});

test("leaves the remote untouched when the candidate state is invalid", async () => {
  const { loadDataBranch, publishDataBranch } = await dataBranchFunctions();
  const { remote, workspace } = await fixtureRepository();
  const timestamp = "2026-07-29T12:00:00.000Z";
  const invalidContent = content(timestamp);
  invalidContent.current.checks.push({ serviceId: "website" } as never);

  await assert.rejects(
    publishDataBranch(workspace, await loadDataBranch(workspace), {
      run: run("123:status", timestamp),
      content: invalidContent,
      incidents: incidents(timestamp),
      retentionDays: 365,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "DATA_BRANCH_INVALID",
  );

  await assert.rejects(git(remote, "rev-parse", "velvet-data"));
  assert.equal(await git(remote, "rev-list", "--count", "main"), "1");
});

test("replaces expired generated history with one lease-protected root", async () => {
  const { loadDataBranch, publishDataBranch } = await dataBranchFunctions();
  const { remote, workspace } = await fixtureRepository();
  const firstTimestamp = "2026-07-27T00:00:00.000Z";
  await publishDataBranch(workspace, await loadDataBranch(workspace), {
    run: run("123:status", firstTimestamp),
    content: content(firstTimestamp),
    incidents: incidents(firstTimestamp),
    retentionDays: 1,
  });
  const secondTimestamp = "2026-07-29T12:00:00.000Z";
  const compacted = await publishDataBranch(
    workspace,
    await loadDataBranch(workspace),
    {
      run: run("124:status", secondTimestamp),
      content: content(secondTimestamp, firstTimestamp),
      incidents: incidents(secondTimestamp),
      retentionDays: 1,
    },
  );

  assert.equal(compacted.outcome, "written");
  assert.equal(compacted.compacted, true);
  assert.equal(await git(remote, "rev-list", "--count", "velvet-data"), "1");
  assert.equal(
    await git(remote, "rev-list", "--parents", "-n", "1", "velvet-data"),
    compacted.revision,
  );
});
