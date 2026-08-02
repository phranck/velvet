import assert from "node:assert/strict";
import { afterEach, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

type TestRun = {
  id: string;
  kind: "uptime" | "response";
  startedAt: string;
  completedAt: string;
};

type TestStateContent = {
  monitoringStartedAt: string;
  current: { checks: unknown[]; services: unknown[] };
  stateChanges: unknown[];
  maintenanceWindows: unknown[];
  responseSamples: unknown[];
  documents: {
    status: unknown;
    responseTimes: unknown;
  };
};

type TestPersistentState = TestStateContent & {
  schemaVersion: 5;
  processedRuns: TestRun[];
};

type UpdateMonitorState = (
  path: string,
  run: TestRun,
  update: (
    current: TestPersistentState | null,
  ) => TestStateContent | Promise<TestStateContent>,
  dependencies?: { beforeReplace?: () => Promise<void> },
) => Promise<{
  outcome: "written" | "duplicate" | "stale";
  state: TestPersistentState;
}>;

type ReadMonitorState = (path: string) => Promise<TestPersistentState | null>;

const storeModule = import("../src/index.js").catch(() => ({}));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function storeFunctions(): Promise<{
  readMonitorState: ReadMonitorState;
  updateMonitorState: UpdateMonitorState;
}> {
  const module = (await storeModule) as Record<string, unknown>;
  if (typeof module.readMonitorState !== "function") {
    assert.fail("@velvet/monitor must export readMonitorState");
  }
  if (typeof module.updateMonitorState !== "function") {
    assert.fail("@velvet/monitor must export updateMonitorState");
  }
  return {
    readMonitorState: module.readMonitorState as ReadMonitorState,
    updateMonitorState: module.updateMonitorState as UpdateMonitorState,
  };
}

async function statePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "velvet-monitor-store-"));
  temporaryDirectories.push(directory);
  return join(directory, "state.json");
}

function run(id: string, minute: number): TestRun {
  const timestamp = `2026-07-29T00:0${minute}:00.000Z`;
  return {
    id,
    kind: "uptime",
    startedAt: timestamp,
    completedAt: timestamp,
  };
}

function stateContent(generatedAt: string): TestStateContent {
  return {
    monitoringStartedAt: "2026-07-29T00:00:00.000Z",
    current: { checks: [], services: [] },
    stateChanges: [],
    maintenanceWindows: [],
    responseSamples: [],
    documents: {
      status: {
        schemaVersion: 1,
        generatedAt,
        monitoringStartedAt: "2026-07-29T00:00:00.000Z",
        services: [],
      },
      responseTimes: {
        schemaVersion: 1,
        generatedAt,
        monitoringStartedAt: "2026-07-29T00:00:00.000Z",
        series: [],
      },
    },
  };
}

test("writes and reads the first complete private state", async () => {
  const { readMonitorState, updateMonitorState } = await storeFunctions();
  const path = await statePath();
  const firstRun = run("run-1", 1);
  const result = await updateMonitorState(path, firstRun, () =>
    stateContent(firstRun.completedAt),
  );

  assert.equal(result.outcome, "written");
  assert.deepEqual(result.state.processedRuns, [firstRun]);
  assert.deepEqual(await readMonitorState(path), result.state);
});

test("persists the confirmed transition timestamp for each check", async () => {
  const { readMonitorState, updateMonitorState } = await storeFunctions();
  const path = await statePath();
  const firstRun = run("run-1", 1);
  const content = stateContent(firstRun.completedAt);
  content.current.checks.push({
    serviceId: "website",
    checkId: "homepage",
    status: "down",
    confirmedStatus: "down",
    confirmedAt: firstRun.completedAt,
    targetAvailability: "unavailable",
    failureStreak: 2,
    recoveryStreak: 0,
    checkedAt: firstRun.completedAt,
    responseTimeMs: null,
    statusCode: 503,
    failureCode: "UNEXPECTED_STATUS",
  });

  const result = await updateMonitorState(path, firstRun, () => content);

  assert.equal(result.state.schemaVersion, 5);
  assert.deepEqual(await readMonitorState(path), result.state);
});

test("persists an unobserved check without inventing a check timestamp", async () => {
  const { readMonitorState, updateMonitorState } = await storeFunctions();
  const path = await statePath();
  const firstRun = run("run-1", 1);
  const content = stateContent(firstRun.completedAt);
  content.current.checks.push({
    serviceId: "website",
    checkId: "homepage",
    status: "unavailable",
    confirmedStatus: null,
    confirmedAt: null,
    targetAvailability: "unobserved",
    failureStreak: 0,
    recoveryStreak: 0,
    checkedAt: null,
    responseTimeMs: null,
    statusCode: null,
    failureCode: null,
  });
  content.current.services.push({
    serviceId: "website",
    status: "unavailable",
    targetAvailability: "unobserved",
  });

  const result = await updateMonitorState(path, firstRun, () => content);

  assert.equal(result.outcome, "written");
  assert.deepEqual(await readMonitorState(path), result.state);
});

test("migrates schema version 1 state without losing confirmed checks", async () => {
  const { readMonitorState } = await storeFunctions();
  const path = await statePath();
  const firstRun = run("run-1", 1);
  const legacyContent: Partial<TestStateContent> = structuredClone(
    stateContent(firstRun.completedAt),
  );
  const legacyState = {
    ...legacyContent,
    schemaVersion: 1,
    processedRuns: [firstRun],
  };
  legacyState.current!.checks.push(
    {
      serviceId: "website",
      checkId: "homepage",
      status: "down",
      confirmedStatus: "down",
      targetAvailability: "unavailable",
      failureStreak: 2,
      recoveryStreak: 0,
      checkedAt: firstRun.completedAt,
      responseTimeMs: null,
      statusCode: 503,
      failureCode: "UNEXPECTED_STATUS",
    },
    {
      serviceId: "api",
      checkId: "readiness",
      status: "degraded",
      confirmedStatus: null,
      targetAvailability: "unavailable",
      failureStreak: 1,
      recoveryStreak: 0,
      checkedAt: firstRun.completedAt,
      responseTimeMs: null,
      statusCode: 503,
      failureCode: "UNEXPECTED_STATUS",
    },
  );
  await writeFile(path, `${JSON.stringify(legacyState)}\n`, "utf8");

  const migrated = await readMonitorState(path);
  const migratedChecks = migrated?.current.checks as
    | Array<{ confirmedAt: string | null }>
    | undefined;

  assert.equal(migrated?.schemaVersion, 5);
  assert.equal(migratedChecks?.[0]?.confirmedAt, firstRun.completedAt);
  assert.equal(migratedChecks?.[1]?.confirmedAt, null);
});

test("migrates schema version 2 state forward", async () => {
  const { readMonitorState } = await storeFunctions();
  const path = await statePath();
  const firstRun = run("run-1", 1);
  const legacyContent: Partial<TestStateContent> = structuredClone(
    stateContent(firstRun.completedAt),
  );
  const legacyState = {
    ...legacyContent,
    schemaVersion: 2,
    processedRuns: [firstRun],
  };
  await writeFile(path, `${JSON.stringify(legacyState)}\n`, "utf8");

  const migrated = await readMonitorState(path);

  assert.equal(migrated?.schemaVersion, 5);
});

test("returns the stored state for a duplicate run without writing", async () => {
  const { updateMonitorState } = await storeFunctions();
  const path = await statePath();
  const firstRun = run("run-1", 1);
  const written = await updateMonitorState(path, firstRun, () =>
    stateContent(firstRun.completedAt),
  );
  let updateCalled = false;
  const duplicate = await updateMonitorState(path, firstRun, () => {
    updateCalled = true;
    return stateContent("2026-07-29T00:02:00.000Z");
  });

  assert.equal(duplicate.outcome, "duplicate");
  assert.equal(updateCalled, false);
  assert.deepEqual(duplicate.state, written.state);
});

test("rejects a run that started before the latest stored run", async () => {
  const { updateMonitorState } = await storeFunctions();
  const path = await statePath();
  const latestRun = run("run-2", 2);
  const written = await updateMonitorState(path, latestRun, () =>
    stateContent(latestRun.completedAt),
  );
  let updateCalled = false;
  const stale = await updateMonitorState(path, run("run-1", 1), () => {
    updateCalled = true;
    return stateContent("2026-07-29T00:01:00.000Z");
  });

  assert.equal(stale.outcome, "stale");
  assert.equal(updateCalled, false);
  assert.deepEqual(stale.state, written.state);
});

test("allows only one state replacement at a time", async () => {
  const { updateMonitorState } = await storeFunctions();
  const path = await statePath();
  let markReplaceStarted!: () => void;
  let releaseReplace!: () => void;
  const replaceStarted = new Promise<void>((resolve) => {
    markReplaceStarted = resolve;
  });
  const replaceReleased = new Promise<void>((resolve) => {
    releaseReplace = resolve;
  });
  const firstRun = run("run-1", 1);
  const firstUpdate = updateMonitorState(
    path,
    firstRun,
    () => stateContent(firstRun.completedAt),
    {
      beforeReplace: async () => {
        markReplaceStarted();
        await replaceReleased;
      },
    },
  );
  await replaceStarted;

  await assert.rejects(
    updateMonitorState(path, run("run-2", 2), () =>
      stateContent("2026-07-29T00:02:00.000Z"),
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "STATE_LOCKED",
  );

  releaseReplace();
  assert.equal((await firstUpdate).outcome, "written");
});

test("keeps the previous complete state when replacement fails", async () => {
  const { readMonitorState, updateMonitorState } = await storeFunctions();
  const path = await statePath();
  const firstRun = run("run-1", 1);
  const written = await updateMonitorState(path, firstRun, () =>
    stateContent(firstRun.completedAt),
  );

  await assert.rejects(
    updateMonitorState(
      path,
      run("run-2", 2),
      () => stateContent("2026-07-29T00:02:00.000Z"),
      {
        beforeReplace: async () => {
          throw new Error("simulated interruption");
        },
      },
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "STATE_WRITE_FAILED" &&
      !error.message.includes("simulated interruption"),
  );

  assert.deepEqual(await readMonitorState(path), written.state);
  assert.deepEqual(await readdir(join(path, "..")), ["state.json"]);
});

test("can write the next run after an interrupted replacement", async () => {
  const { updateMonitorState } = await storeFunctions();
  const path = await statePath();
  const firstRun = run("run-1", 1);
  await updateMonitorState(path, firstRun, () =>
    stateContent(firstRun.completedAt),
  );
  const secondRun = run("run-2", 2);

  await assert.rejects(
    updateMonitorState(
      path,
      secondRun,
      () => stateContent(secondRun.completedAt),
      { beforeReplace: async () => Promise.reject(new Error("interrupted")) },
    ),
  );
  const recovered = await updateMonitorState(path, secondRun, () =>
    stateContent(secondRun.completedAt),
  );

  assert.equal(recovered.outcome, "written");
  assert.deepEqual(recovered.state.processedRuns, [secondRun]);
});

test("drops processed runs no longer referenced by compacted state", async () => {
  const { updateMonitorState } = await storeFunctions();
  const path = await statePath();
  const firstRun = run("run-1", 1);
  const secondRun = run("run-2", 2);
  const thirdRun = run("run-3", 3);
  const firstChange = {
    runId: firstRun.id,
    serviceId: "website",
    changedAt: firstRun.completedAt,
    status: "up",
    targetAvailability: "available",
  };
  const secondChange = {
    runId: secondRun.id,
    serviceId: "website",
    changedAt: secondRun.completedAt,
    status: "down",
    targetAvailability: "unavailable",
  };

  await updateMonitorState(path, firstRun, () => ({
    ...stateContent(firstRun.completedAt),
    stateChanges: [firstChange],
  }));
  await updateMonitorState(path, secondRun, () => ({
    ...stateContent(secondRun.completedAt),
    stateChanges: [firstChange, secondChange],
  }));
  const compacted = await updateMonitorState(path, thirdRun, () => ({
    ...stateContent(thirdRun.completedAt),
    stateChanges: [secondChange],
  }));

  assert.deepEqual(compacted.state.processedRuns, [secondRun, thirdRun]);
});

test("rejects an incomplete private state before replacing the file", async () => {
  const { readMonitorState, updateMonitorState } = await storeFunctions();
  const path = await statePath();
  const firstRun = run("run-1", 1);

  await assert.rejects(
    updateMonitorState(path, firstRun, () => {
      const incomplete = stateContent(firstRun.completedAt);
      incomplete.current.checks.push({ serviceId: "website" });
      return incomplete;
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "STATE_INVALID",
  );
  assert.equal(await readMonitorState(path), null);
});
