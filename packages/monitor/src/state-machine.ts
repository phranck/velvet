import type {
  MonitorObservation,
  TargetAvailability,
} from "./orchestrator.js";
import type {
  MonitorCheckState,
  MonitorStatus,
  MonitorThresholds,
} from "./state.js";

export function aggregateServiceStatus(
  checks: MonitorCheckState[],
): MonitorStatus {
  const firstStatus = checks[0]?.status;
  if (firstStatus === undefined) {
    return "unavailable";
  }

  return checks.every((check) => check.status === firstStatus)
    ? firstStatus
    : "degraded";
}

export function aggregateServiceTargetAvailability(
  checks: MonitorCheckState[],
): TargetAvailability {
  if (checks.some((check) => check.targetAvailability === "unavailable")) {
    return "unavailable";
  }
  if (
    checks.length === 0 ||
    checks.some((check) => check.targetAvailability === "unobserved")
  ) {
    return "unobserved";
  }
  return "available";
}

export function updateCheckState(
  previous: MonitorCheckState | null,
  observation: MonitorObservation,
  thresholds: MonitorThresholds,
): MonitorCheckState {
  const commonState = {
    serviceId: observation.serviceId,
    checkId: observation.checkId,
    targetAvailability: observation.targetAvailability,
    checkedAt: observation.checkedAt,
    responseTimeMs: observation.responseTimeMs,
    statusCode: observation.statusCode,
    failureCode: observation.failureCode,
  };

  if (observation.targetAvailability === "unobserved") {
    return {
      ...commonState,
      status: "unavailable",
      confirmedStatus: previous?.confirmedStatus ?? null,
      confirmedAt: previous?.confirmedAt ?? null,
      failureStreak: previous?.failureStreak ?? 0,
      recoveryStreak: previous?.recoveryStreak ?? 0,
    };
  }

  if (observation.targetAvailability === "unavailable") {
    const failureStreak =
      previous?.confirmedStatus === "down"
        ? thresholds.failureThreshold
        : (previous?.failureStreak ?? 0) + 1;
    const confirmedDown =
      previous?.confirmedStatus === "down" ||
      failureStreak >= thresholds.failureThreshold;
    const confirmedStatus = confirmedDown
      ? "down"
      : (previous?.confirmedStatus ?? null);
    return {
      ...commonState,
      status: confirmedDown ? "down" : "degraded",
      confirmedStatus,
      confirmedAt:
        confirmedStatus === null
          ? null
          : confirmedStatus === previous?.confirmedStatus
          ? (previous?.confirmedAt ?? null)
          : observation.checkedAt,
      failureStreak,
      recoveryStreak: 0,
    };
  }

  if (
    observation.targetAvailability === "available" &&
    previous?.confirmedStatus === "down"
  ) {
    const recoveryStreak = previous.recoveryStreak + 1;
    const confirmedUp = recoveryStreak >= thresholds.recoveryThreshold;
    return {
      ...commonState,
      status: confirmedUp ? "up" : "degraded",
      confirmedStatus: confirmedUp ? "up" : "down",
      confirmedAt: confirmedUp
        ? observation.checkedAt
        : previous.confirmedAt,
      failureStreak: 0,
      recoveryStreak: confirmedUp ? 0 : recoveryStreak,
    };
  }

  return {
    ...commonState,
    status: "up",
    confirmedStatus: "up",
    confirmedAt:
      previous?.confirmedStatus === "up"
        ? previous.confirmedAt
        : observation.checkedAt,
    failureStreak: 0,
    recoveryStreak: 0,
  };
}
