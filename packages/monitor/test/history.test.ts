import assert from "node:assert/strict";
import { test } from "bun:test";

type TestStateChange = {
  runId: string;
  serviceId: string;
  changedAt: string;
  status: "up" | "degraded" | "down" | "unavailable";
  targetAvailability: "available" | "unavailable" | "unobserved";
};

type TestMaintenanceWindow = {
  id: string;
  affectedServiceIds: string[];
  startsAt: string;
  endsAt: string;
};

type DailyAvailability = {
  date: string;
  monitoredSeconds: number;
  unavailableSeconds: number;
};

type TestServiceState = {
  serviceId: string;
  status: TestStateChange["status"];
  targetAvailability: TestStateChange["targetAvailability"];
};

type DeriveDailyAvailability = (input: {
  serviceId: string;
  monitoringStartedAt: string;
  generatedAt: string;
  stateChanges: TestStateChange[];
  maintenanceWindows: TestMaintenanceWindow[];
}) => DailyAvailability[];

type AppendStateChanges = (
  history: TestStateChange[],
  serviceStates: TestServiceState[],
  run: { runId: string; changedAt: string },
) => TestStateChange[];

type TestResponseSample = {
  serviceId: string;
  checkId: string;
  timestamp: string;
  responseTimeMs: number | null;
};

type TestResponseObservation = {
  serviceId: string;
  checkId: string;
  checkedAt: string;
  responseTimeMs: number | null;
};

type AppendResponseSamples = (
  history: TestResponseSample[],
  observations: TestResponseObservation[],
  options: { generatedAt: string; retentionDays: number },
) => TestResponseSample[];

const historyModule = import("../src/index.js").catch(() => ({}));

async function historyFunctions(): Promise<{
  deriveDailyAvailability: DeriveDailyAvailability;
}> {
  const module = (await historyModule) as Record<string, unknown>;
  if (typeof module.deriveDailyAvailability !== "function") {
    assert.fail("@velvet/monitor must export deriveDailyAvailability");
  }
  return {
    deriveDailyAvailability:
      module.deriveDailyAvailability as DeriveDailyAvailability,
  };
}

async function stateHistoryFunctions(): Promise<{
  appendStateChanges: AppendStateChanges;
}> {
  const module = (await historyModule) as Record<string, unknown>;
  if (typeof module.appendStateChanges !== "function") {
    assert.fail("@velvet/monitor must export appendStateChanges");
  }
  return {
    appendStateChanges: module.appendStateChanges as AppendStateChanges,
  };
}

async function responseHistoryFunctions(): Promise<{
  appendResponseSamples: AppendResponseSamples;
}> {
  const module = (await historyModule) as Record<string, unknown>;
  if (typeof module.appendResponseSamples !== "function") {
    assert.fail("@velvet/monitor must export appendResponseSamples");
  }
  return {
    appendResponseSamples:
      module.appendResponseSamples as AppendResponseSamples,
  };
}

function stateChange(
  changedAt: string,
  targetAvailability: TestStateChange["targetAvailability"],
  overrides: Partial<TestStateChange> = {},
): TestStateChange {
  return {
    runId: `run-${changedAt}`,
    serviceId: "website",
    changedAt,
    status:
      targetAvailability === "available"
        ? "up"
        : targetAvailability === "unavailable"
          ? "down"
          : "unavailable",
    targetAvailability,
    ...overrides,
  };
}

test("keeps a short target failure in daily availability", async () => {
  const { deriveDailyAvailability } = await historyFunctions();
  const dailyAvailability = deriveDailyAvailability({
    serviceId: "website",
    monitoringStartedAt: "2026-07-29T00:00:00.000Z",
    generatedAt: "2026-07-29T02:00:00.000Z",
    stateChanges: [
      stateChange("2026-07-29T00:00:00.000Z", "available"),
      stateChange("2026-07-29T01:00:00.000Z", "unavailable"),
      stateChange("2026-07-29T01:00:30.000Z", "available"),
    ],
    maintenanceWindows: [],
  });

  assert.deepEqual(dailyAvailability, [
    {
      date: "2026-07-29",
      monitoredSeconds: 7_200,
      unavailableSeconds: 30,
    },
  ]);
});

test("excludes explicitly covered maintenance from measured time", async () => {
  const { deriveDailyAvailability } = await historyFunctions();
  const dailyAvailability = deriveDailyAvailability({
    serviceId: "website",
    monitoringStartedAt: "2026-07-29T00:00:00.000Z",
    generatedAt: "2026-07-29T03:00:00.000Z",
    stateChanges: [
      stateChange("2026-07-29T00:00:00.000Z", "available"),
      stateChange("2026-07-29T01:00:00.000Z", "unavailable"),
      stateChange("2026-07-29T02:00:00.000Z", "available"),
    ],
    maintenanceWindows: [
      {
        id: "database-maintenance",
        affectedServiceIds: ["website"],
        startsAt: "2026-07-29T01:15:00.000Z",
        endsAt: "2026-07-29T01:45:00.000Z",
      },
    ],
  });

  assert.deepEqual(dailyAvailability, [
    {
      date: "2026-07-29",
      monitoredSeconds: 9_000,
      unavailableSeconds: 1_800,
    },
  ]);
});

test("splits measured downtime at UTC day boundaries", async () => {
  const { deriveDailyAvailability } = await historyFunctions();
  const dailyAvailability = deriveDailyAvailability({
    serviceId: "website",
    monitoringStartedAt: "2026-07-29T23:59:30.000Z",
    generatedAt: "2026-07-30T00:00:30.000Z",
    stateChanges: [
      stateChange("2026-07-29T23:59:30.000Z", "available"),
      stateChange("2026-07-29T23:59:45.000Z", "unavailable"),
      stateChange("2026-07-30T00:00:15.000Z", "available"),
    ],
    maintenanceWindows: [],
  });

  assert.deepEqual(dailyAvailability, [
    {
      date: "2026-07-29",
      monitoredSeconds: 30,
      unavailableSeconds: 15,
    },
    {
      date: "2026-07-30",
      monitoredSeconds: 30,
      unavailableSeconds: 15,
    },
  ]);
});

test("excludes periods without a reliable target result", async () => {
  const { deriveDailyAvailability } = await historyFunctions();
  const dailyAvailability = deriveDailyAvailability({
    serviceId: "website",
    monitoringStartedAt: "2026-07-29T00:00:00.000Z",
    generatedAt: "2026-07-29T02:00:00.000Z",
    stateChanges: [
      stateChange("2026-07-29T00:00:00.000Z", "available"),
      stateChange("2026-07-29T01:00:00.000Z", "unobserved"),
      stateChange("2026-07-29T01:10:00.000Z", "available"),
    ],
    maintenanceWindows: [],
  });

  assert.deepEqual(dailyAvailability, [
    {
      date: "2026-07-29",
      monitoredSeconds: 6_600,
      unavailableSeconds: 0,
    },
  ]);
});

test("matches every generated six-minute availability sequence", async () => {
  const { deriveDailyAvailability } = await historyFunctions();
  const availabilities: TestStateChange["targetAvailability"][] = [
    "available",
    "unavailable",
    "unobserved",
  ];
  const sequenceLength = 6;

  for (let encoded = 0; encoded < 3 ** sequenceLength; encoded += 1) {
    let remaining = encoded;
    const sequence = Array.from({ length: sequenceLength }, (_, index) => {
      const targetAvailability = availabilities[remaining % 3]!;
      remaining = Math.floor(remaining / 3);
      return stateChange(
        `2026-07-29T00:0${index}:00.000Z`,
        targetAvailability,
      );
    });
    const expectedMonitoredSeconds =
      sequence.filter(
        ({ targetAvailability }) => targetAvailability !== "unobserved",
      ).length * 60;
    const expectedUnavailableSeconds =
      sequence.filter(
        ({ targetAvailability }) => targetAvailability === "unavailable",
      ).length * 60;
    const dailyAvailability = deriveDailyAvailability({
      serviceId: "website",
      monitoringStartedAt: "2026-07-29T00:00:00.000Z",
      generatedAt: "2026-07-29T00:06:00.000Z",
      stateChanges: sequence,
      maintenanceWindows: [],
    });

    if (expectedMonitoredSeconds === 0) {
      assert.deepEqual(dailyAvailability, []);
      continue;
    }
    assert.deepEqual(dailyAvailability, [
      {
        date: "2026-07-29",
        monitoredSeconds: expectedMonitoredSeconds,
        unavailableSeconds: expectedUnavailableSeconds,
      },
    ]);
  }
});

test("appends only display or measured availability changes", async () => {
  const { appendStateChanges } = await stateHistoryFunctions();
  const initial = appendStateChanges(
    [],
    [
      {
        serviceId: "website",
        status: "up",
        targetAvailability: "available",
      },
    ],
    { runId: "run-1", changedAt: "2026-07-29T00:00:00.000Z" },
  );
  const unchanged = appendStateChanges(
    initial,
    [
      {
        serviceId: "website",
        status: "up",
        targetAvailability: "available",
      },
    ],
    { runId: "run-2", changedAt: "2026-07-29T00:01:00.000Z" },
  );
  const failed = appendStateChanges(
    unchanged,
    [
      {
        serviceId: "website",
        status: "degraded",
        targetAvailability: "unavailable",
      },
    ],
    { runId: "run-3", changedAt: "2026-07-29T00:02:00.000Z" },
  );
  const measuredRecovery = appendStateChanges(
    failed,
    [
      {
        serviceId: "website",
        status: "degraded",
        targetAvailability: "available",
      },
    ],
    { runId: "run-4", changedAt: "2026-07-29T00:03:00.000Z" },
  );

  assert.equal(initial.length, 1);
  assert.equal(unchanged.length, 1);
  assert.equal(failed.length, 2);
  assert.equal(measuredRecovery.length, 3);
  assert.deepEqual(
    measuredRecovery.map(({ runId, status, targetAvailability }) => ({
      runId,
      status,
      targetAvailability,
    })),
    [
      { runId: "run-1", status: "up", targetAvailability: "available" },
      {
        runId: "run-3",
        status: "degraded",
        targetAvailability: "unavailable",
      },
      {
        runId: "run-4",
        status: "degraded",
        targetAvailability: "available",
      },
    ],
  );
});

test("keeps response samples separate and applies their retention period", async () => {
  const { appendResponseSamples } = await responseHistoryFunctions();
  const samples = appendResponseSamples(
    [
      {
        serviceId: "website",
        checkId: "primary",
        timestamp: "2026-07-28T11:59:59.999Z",
        responseTimeMs: 90,
      },
      {
        serviceId: "website",
        checkId: "primary",
        timestamp: "2026-07-28T12:00:00.000Z",
        responseTimeMs: 95,
      },
    ],
    [
      {
        serviceId: "website",
        checkId: "primary",
        checkedAt: "2026-07-29T11:59:00.000Z",
        responseTimeMs: 125,
      },
      {
        serviceId: "website",
        checkId: "secondary",
        checkedAt: "2026-07-29T11:59:01.000Z",
        responseTimeMs: null,
      },
    ],
    { generatedAt: "2026-07-29T12:00:00.000Z", retentionDays: 1 },
  );

  assert.deepEqual(samples, [
    {
      serviceId: "website",
      checkId: "primary",
      timestamp: "2026-07-28T12:00:00.000Z",
      responseTimeMs: 95,
    },
    {
      serviceId: "website",
      checkId: "primary",
      timestamp: "2026-07-29T11:59:00.000Z",
      responseTimeMs: 125,
    },
    {
      serviceId: "website",
      checkId: "secondary",
      timestamp: "2026-07-29T11:59:01.000Z",
      responseTimeMs: null,
    },
  ]);
});
