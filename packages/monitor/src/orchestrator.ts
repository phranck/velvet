import type { NormalizedService } from "@velvet/contracts";

import { executeHttpCheck } from "./http-executor.js";
import type {
  CheckFailureCode,
  HttpCheckExecutionResult,
  HttpExecutorDependencies,
} from "./types.js";

export type TargetAvailability =
  | "available"
  | "unavailable"
  | "unobserved";

export interface MonitorObservation {
  serviceId: string;
  checkId: string;
  checkedAt: string;
  targetAvailability: TargetAvailability;
  responseTimeMs: number | null;
  statusCode: number | null;
  failureCode: CheckFailureCode | null;
  attempts: 1 | 2;
}

export interface MonitorCheckLogRecord {
  operation: "check";
  serviceId: string;
  checkId: string;
  result: TargetAvailability;
  statusCode: number | null;
  failureCode: CheckFailureCode | null;
  attempts: 1 | 2;
}

export interface MonitorOrchestratorDependencies
  extends HttpExecutorDependencies {
  executeCheck?: typeof executeHttpCheck;
  logger?: (record: MonitorCheckLogRecord) => void;
}

const UNOBSERVED_FAILURE_CODES = new Set<CheckFailureCode>([
  "CANCELLED",
  "INVALID_REQUEST_HEADER",
  "SECRET_NOT_FOUND",
  "UNKNOWN_ERROR",
]);

const NON_RETRYABLE_FAILURE_CODES = new Set<CheckFailureCode>([
  "CANCELLED",
  "INVALID_REQUEST_HEADER",
  "SECRET_NOT_FOUND",
]);

const observation = (
  serviceId: string,
  result: HttpCheckExecutionResult,
  attempts: 1 | 2,
): MonitorObservation => ({
  serviceId,
  checkId: result.checkId,
  checkedAt: result.checkedAt,
  targetAvailability:
    result.outcome === "success"
      ? "available"
      : result.error && UNOBSERVED_FAILURE_CODES.has(result.error.code)
        ? "unobserved"
        : "unavailable",
  responseTimeMs: result.outcome === "success" ? result.latencyMs : null,
  statusCode: result.statusCode,
  failureCode: result.error?.code ?? null,
  attempts,
});

export async function executeMonitorChecks(
  services: NormalizedService[],
  dependencies: MonitorOrchestratorDependencies = {},
): Promise<MonitorObservation[]> {
  const {
    executeCheck = executeHttpCheck,
    logger,
    ...executorDependencies
  } = dependencies;
  const observations: MonitorObservation[] = [];
  for (const service of services) {
    for (const check of service.checks) {
      let result = await executeCheck(check, executorDependencies);
      let attempts: 1 | 2 = 1;
      if (
        result.outcome === "failure" &&
        result.error &&
        !NON_RETRYABLE_FAILURE_CODES.has(result.error.code)
      ) {
        result = await executeCheck(check, executorDependencies);
        attempts = 2;
      }
      const checkObservation = observation(service.id, result, attempts);
      observations.push(checkObservation);
      logger?.({
        operation: "check",
        serviceId: checkObservation.serviceId,
        checkId: checkObservation.checkId,
        result: checkObservation.targetAvailability,
        statusCode: checkObservation.statusCode,
        failureCode: checkObservation.failureCode,
        attempts: checkObservation.attempts,
      });
    }
  }
  return observations;
}
