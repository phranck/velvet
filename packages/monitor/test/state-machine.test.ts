import assert from "node:assert/strict";
import { test } from "bun:test";

type TestObservation = {
  serviceId: string;
  checkId: string;
  checkedAt: string;
  targetAvailability: "available" | "unavailable" | "unobserved";
  responseTimeMs: number | null;
  statusCode: number | null;
  failureCode: string | null;
  attempts: 1 | 2;
};

type TestCheckState = {
  serviceId: string;
  checkId: string;
  status: "up" | "degraded" | "down" | "unavailable";
  confirmedStatus: "up" | "down" | null;
  targetAvailability: "available" | "unavailable" | "unobserved";
  failureStreak: number;
  recoveryStreak: number;
  checkedAt: string;
  responseTimeMs: number | null;
  statusCode: number | null;
  failureCode: string | null;
};

type UpdateCheckState = (
  previous: TestCheckState | null,
  observation: TestObservation,
  thresholds: { failureThreshold: number; recoveryThreshold: number },
) => TestCheckState;

type AggregateServiceStatus = (
  checks: TestCheckState[],
) => TestCheckState["status"];

type AggregateServiceTargetAvailability = (
  checks: TestCheckState[],
) => TestCheckState["targetAvailability"];

const stateModule = import("../src/index.js").catch(() => ({}));

async function stateMachine(): Promise<{
  updateCheckState: UpdateCheckState;
  aggregateServiceStatus: AggregateServiceStatus;
}> {
  const module = (await stateModule) as Record<string, unknown>;
  if (typeof module.updateCheckState !== "function") {
    assert.fail("@velvet/monitor must export updateCheckState");
  }
  if (typeof module.aggregateServiceStatus !== "function") {
    assert.fail("@velvet/monitor must export aggregateServiceStatus");
  }
  return {
    updateCheckState: module.updateCheckState as UpdateCheckState,
    aggregateServiceStatus:
      module.aggregateServiceStatus as AggregateServiceStatus,
  };
}

async function serviceAvailabilityFunctions(): Promise<{
  aggregateServiceTargetAvailability: AggregateServiceTargetAvailability;
}> {
  const module = (await stateModule) as Record<string, unknown>;
  if (typeof module.aggregateServiceTargetAvailability !== "function") {
    assert.fail(
      "@velvet/monitor must export aggregateServiceTargetAvailability",
    );
  }
  return {
    aggregateServiceTargetAvailability:
      module.aggregateServiceTargetAvailability as AggregateServiceTargetAvailability,
  };
}

function observation(
  targetAvailability: TestObservation["targetAvailability"],
  overrides: Partial<TestObservation> = {},
): TestObservation {
  return {
    serviceId: "api",
    checkId: "readiness",
    checkedAt: "2026-07-29T12:00:00.000Z",
    targetAvailability,
    responseTimeMs: targetAvailability === "available" ? 125 : null,
    statusCode: targetAvailability === "available" ? 200 : null,
    failureCode:
      targetAvailability === "available" ? null : "CONNECTION_ERROR",
    attempts: 1,
    ...overrides,
  };
}

test("initial successful observation creates an up check state", async () => {
  const { updateCheckState } = await stateMachine();
  const state = updateCheckState(null, observation("available"), {
    failureThreshold: 2,
    recoveryThreshold: 2,
  });

  assert.deepEqual(state, {
    serviceId: "api",
    checkId: "readiness",
    status: "up",
    confirmedStatus: "up",
    targetAvailability: "available",
    failureStreak: 0,
    recoveryStreak: 0,
    checkedAt: "2026-07-29T12:00:00.000Z",
    responseTimeMs: 125,
    statusCode: 200,
    failureCode: null,
  });
});

test("confirms down only after the configured consecutive failures", async () => {
  const { updateCheckState } = await stateMachine();
  const thresholds = { failureThreshold: 2, recoveryThreshold: 2 };
  const firstFailure = updateCheckState(
    null,
    observation("unavailable"),
    thresholds,
  );
  const confirmedFailure = updateCheckState(
    firstFailure,
    observation("unavailable", {
      checkedAt: "2026-07-29T12:01:00.000Z",
    }),
    thresholds,
  );

  assert.equal(firstFailure.status, "degraded");
  assert.equal(firstFailure.confirmedStatus, null);
  assert.equal(firstFailure.failureStreak, 1);
  assert.equal(firstFailure.recoveryStreak, 0);
  assert.equal(confirmedFailure.status, "down");
  assert.equal(confirmedFailure.confirmedStatus, "down");
  assert.equal(confirmedFailure.failureStreak, 2);
  assert.equal(confirmedFailure.recoveryStreak, 0);
});

test("confirms recovery only after consecutive successful runs", async () => {
  const { updateCheckState } = await stateMachine();
  const thresholds = { failureThreshold: 2, recoveryThreshold: 2 };
  const firstFailure = updateCheckState(
    null,
    observation("unavailable"),
    thresholds,
  );
  const down = updateCheckState(
    firstFailure,
    observation("unavailable", {
      checkedAt: "2026-07-29T12:01:00.000Z",
    }),
    thresholds,
  );
  const firstRecovery = updateCheckState(
    down,
    observation("available", {
      checkedAt: "2026-07-29T12:02:00.000Z",
    }),
    thresholds,
  );
  const recovered = updateCheckState(
    firstRecovery,
    observation("available", {
      checkedAt: "2026-07-29T12:03:00.000Z",
    }),
    thresholds,
  );

  assert.equal(firstRecovery.status, "degraded");
  assert.equal(firstRecovery.confirmedStatus, "down");
  assert.equal(firstRecovery.targetAvailability, "available");
  assert.equal(firstRecovery.failureStreak, 0);
  assert.equal(firstRecovery.recoveryStreak, 1);
  assert.equal(recovered.status, "up");
  assert.equal(recovered.confirmedStatus, "up");
  assert.equal(recovered.failureStreak, 0);
  assert.equal(recovered.recoveryStreak, 0);
});

test("keeps a confirmed outage down when a pending recovery fails", async () => {
  const { updateCheckState } = await stateMachine();
  const thresholds = { failureThreshold: 2, recoveryThreshold: 2 };
  const firstFailure = updateCheckState(
    null,
    observation("unavailable"),
    thresholds,
  );
  const down = updateCheckState(
    firstFailure,
    observation("unavailable", {
      checkedAt: "2026-07-29T12:01:00.000Z",
    }),
    thresholds,
  );
  const pendingRecovery = updateCheckState(
    down,
    observation("available", {
      checkedAt: "2026-07-29T12:02:00.000Z",
    }),
    thresholds,
  );
  const failedRecovery = updateCheckState(
    pendingRecovery,
    observation("unavailable", {
      checkedAt: "2026-07-29T12:03:00.000Z",
    }),
    thresholds,
  );

  assert.equal(pendingRecovery.status, "degraded");
  assert.equal(failedRecovery.status, "down");
  assert.equal(failedRecovery.confirmedStatus, "down");
  assert.equal(failedRecovery.failureStreak, 2);
  assert.equal(failedRecovery.recoveryStreak, 0);
});

test("marks an unobserved check unavailable without changing its counters", async () => {
  const { updateCheckState } = await stateMachine();
  const thresholds = { failureThreshold: 2, recoveryThreshold: 2 };
  const firstFailure = updateCheckState(
    null,
    observation("unavailable"),
    thresholds,
  );
  const down = updateCheckState(
    firstFailure,
    observation("unavailable", {
      checkedAt: "2026-07-29T12:01:00.000Z",
    }),
    thresholds,
  );
  const firstRecovery = updateCheckState(
    down,
    observation("available", {
      checkedAt: "2026-07-29T12:02:00.000Z",
    }),
    thresholds,
  );
  const unobserved = updateCheckState(
    firstRecovery,
    observation("unobserved", {
      checkedAt: "2026-07-29T12:03:00.000Z",
      failureCode: "SECRET_NOT_FOUND",
    }),
    thresholds,
  );

  assert.equal(unobserved.status, "unavailable");
  assert.equal(unobserved.confirmedStatus, "down");
  assert.equal(unobserved.targetAvailability, "unobserved");
  assert.equal(unobserved.failureStreak, 0);
  assert.equal(unobserved.recoveryStreak, 1);
  assert.equal(unobserved.checkedAt, "2026-07-29T12:03:00.000Z");
  assert.equal(unobserved.failureCode, "SECRET_NOT_FOUND");
});

test("combines check states into one service status", async () => {
  const { aggregateServiceStatus, updateCheckState } = await stateMachine();
  const thresholds = { failureThreshold: 1, recoveryThreshold: 1 };
  const stateFor = (
    targetAvailability: TestObservation["targetAvailability"],
    checkId: string,
  ): TestCheckState =>
    updateCheckState(
      null,
      observation(targetAvailability, { checkId }),
      thresholds,
    );
  const up = stateFor("available", "up");
  const down = stateFor("unavailable", "down");
  const unavailable = stateFor("unobserved", "unavailable");
  const degraded = updateCheckState(
    null,
    observation("unavailable", { checkId: "degraded" }),
    { failureThreshold: 2, recoveryThreshold: 1 },
  );

  assert.equal(aggregateServiceStatus([]), "unavailable");
  assert.equal(aggregateServiceStatus([up, up]), "up");
  assert.equal(aggregateServiceStatus([down, down]), "down");
  assert.equal(
    aggregateServiceStatus([unavailable, unavailable]),
    "unavailable",
  );
  assert.equal(aggregateServiceStatus([up, down]), "degraded");
  assert.equal(aggregateServiceStatus([up, unavailable]), "degraded");
  assert.equal(aggregateServiceStatus([degraded, up]), "degraded");
  assert.equal(aggregateServiceStatus([down, unavailable]), "degraded");
});

test("combines measured check availability without hiding known failures", async () => {
  const { aggregateServiceTargetAvailability } =
    await serviceAvailabilityFunctions();
  const { updateCheckState } = await stateMachine();
  const thresholds = { failureThreshold: 1, recoveryThreshold: 1 };
  const stateFor = (
    targetAvailability: TestObservation["targetAvailability"],
    checkId: string,
  ): TestCheckState =>
    updateCheckState(
      null,
      observation(targetAvailability, { checkId }),
      thresholds,
    );
  const available = stateFor("available", "available");
  const unavailable = stateFor("unavailable", "unavailable");
  const unobserved = stateFor("unobserved", "unobserved");

  assert.equal(aggregateServiceTargetAvailability([]), "unobserved");
  assert.equal(
    aggregateServiceTargetAvailability([available, available]),
    "available",
  );
  assert.equal(
    aggregateServiceTargetAvailability([available, unavailable]),
    "unavailable",
  );
  assert.equal(
    aggregateServiceTargetAvailability([unavailable, unobserved]),
    "unavailable",
  );
  assert.equal(
    aggregateServiceTargetAvailability([available, unobserved]),
    "unobserved",
  );
});
