import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

import {
  validateResponseTimesDocument,
  validateStatusDocument,
} from "@velvet/contracts";

import {
  MONITOR_STATE_SCHEMA_VERSION,
  type MonitorCheckState,
  type MonitorMaintenanceWindow,
  type MonitorPersistentState,
  type MonitorResponseSample,
  type MonitorRun,
  type MonitorServiceState,
  type MonitorStateContent,
  type MonitorStateChange,
  type MonitorStatus,
} from "./state.js";
import type { TargetAvailability } from "./orchestrator.js";
import type { CheckFailureCode } from "./types.js";

export type MonitorStateStoreErrorCode =
  | "STATE_INVALID"
  | "STATE_LOCKED"
  | "STATE_READ_FAILED"
  | "STATE_WRITE_FAILED";

export class MonitorStateStoreError extends Error {
  readonly code: MonitorStateStoreErrorCode;

  constructor(code: MonitorStateStoreErrorCode) {
    const messages: Record<MonitorStateStoreErrorCode, string> = {
      STATE_INVALID: "Monitor state is invalid",
      STATE_LOCKED: "Monitor state is being updated",
      STATE_READ_FAILED: "Monitor state could not be read",
      STATE_WRITE_FAILED: "Monitor state could not be written",
    };
    super(messages[code]);
    this.name = "MonitorStateStoreError";
    this.code = code;
  }
}

export interface MonitorStateStoreDependencies {
  beforeReplace?: (temporaryPath: string) => Promise<void>;
}

export interface MonitorStateUpdateResult {
  outcome: "written" | "duplicate" | "stale";
  state: MonitorPersistentState;
}

type NodeError = Error & { code?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    actualKeys.every((key) => keys.includes(key))
  );
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(value) &&
    value.length <= 64
  );
}

function isMonitorStatus(value: unknown): value is MonitorStatus {
  return ["up", "degraded", "down", "unavailable"].includes(
    value as string,
  );
}

function isTargetAvailability(value: unknown): value is TargetAvailability {
  return ["available", "unavailable", "unobserved"].includes(
    value as string,
  );
}

function isFailureCode(value: unknown): value is CheckFailureCode | null {
  return (
    value === null ||
    [
      "ASSERTION_MISMATCH",
      "CANCELLED",
      "CONNECTION_ERROR",
      "DNS_ERROR",
      "INVALID_JSON",
      "INVALID_REDIRECT",
      "INVALID_REQUEST_HEADER",
      "RESPONSE_BODY_TOO_LARGE",
      "SECRET_NOT_FOUND",
      "TIMEOUT",
      "TLS_ERROR",
      "TOO_MANY_REDIRECTS",
      "UNEXPECTED_STATUS",
      "UNKNOWN_ERROR",
    ].includes(value as string)
  );
}

function isCheckState(value: unknown): value is MonitorCheckState {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "serviceId",
      "checkId",
      "status",
      "confirmedStatus",
      "confirmedAt",
      "targetAvailability",
      "failureStreak",
      "recoveryStreak",
      "checkedAt",
      "responseTimeMs",
      "statusCode",
      "failureCode",
    ]) &&
    isIdentifier(value.serviceId) &&
    isIdentifier(value.checkId) &&
    isMonitorStatus(value.status) &&
    ["up", "down", null].includes(value.confirmedStatus as string | null) &&
    (value.confirmedAt === null || isTimestamp(value.confirmedAt)) &&
    isTargetAvailability(value.targetAvailability) &&
    Number.isInteger(value.failureStreak) &&
    (value.failureStreak as number) >= 0 &&
    Number.isInteger(value.recoveryStreak) &&
    (value.recoveryStreak as number) >= 0 &&
    (value.checkedAt === null || isTimestamp(value.checkedAt)) &&
    (value.responseTimeMs === null ||
      (typeof value.responseTimeMs === "number" &&
        Number.isFinite(value.responseTimeMs) &&
        value.responseTimeMs >= 0)) &&
    (value.statusCode === null ||
      (Number.isInteger(value.statusCode) &&
        (value.statusCode as number) >= 100 &&
        (value.statusCode as number) <= 599)) &&
    isFailureCode(value.failureCode)
  );
}

function migrateLegacyCheckState(value: unknown): MonitorCheckState | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "serviceId",
      "checkId",
      "status",
      "confirmedStatus",
      "targetAvailability",
      "failureStreak",
      "recoveryStreak",
      "checkedAt",
      "responseTimeMs",
      "statusCode",
      "failureCode",
    ])
  ) {
    return null;
  }
  const migrated = {
    ...value,
    confirmedAt: value.confirmedStatus === null ? null : value.checkedAt,
  };
  return isCheckState(migrated) ? migrated : null;
}

function migrateLegacyPersistentState(value: unknown): unknown {
  let migrated = value;
  if (
    isRecord(migrated) &&
    migrated.schemaVersion === 1 &&
    isRecord(migrated.current) &&
    Array.isArray(migrated.current.checks)
  ) {
    const checks = migrated.current.checks.map(migrateLegacyCheckState);
    if (checks.some((check) => check === null)) {
      return value;
    }
    migrated = {
      ...migrated,
      schemaVersion: 2,
      current: {
        ...migrated.current,
        checks,
      },
    };
  }
  /*
   * Versions 3 and 4 added places to keep measurements imported from another
   * tool. Nothing produces those any more, so a state at any version below 5
   * arrives here and leaves without them. Dropping rather than carrying them
   * keeps the stored shape and the type in step, which is what the exact-key
   * check below relies on.
   */
  if (isRecord(migrated) && typeof migrated.schemaVersion === "number" &&
      migrated.schemaVersion >= 2 && migrated.schemaVersion < MONITOR_STATE_SCHEMA_VERSION) {
    const { importedDailyAvailability, importedEvents, ...rest } = migrated;
    void importedDailyAvailability;
    void importedEvents;
    return { ...rest, schemaVersion: MONITOR_STATE_SCHEMA_VERSION };
  }
  return migrated;
}

function isServiceState(value: unknown): value is MonitorServiceState {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["serviceId", "status", "targetAvailability"]) &&
    isIdentifier(value.serviceId) &&
    isMonitorStatus(value.status) &&
    isTargetAvailability(value.targetAvailability)
  );
}

function isStateChange(value: unknown): value is MonitorStateChange {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "runId",
      "serviceId",
      "changedAt",
      "status",
      "targetAvailability",
    ]) &&
    typeof value.runId === "string" &&
    isIdentifier(value.serviceId) &&
    isTimestamp(value.changedAt) &&
    isMonitorStatus(value.status) &&
    isTargetAvailability(value.targetAvailability)
  );
}

function isMaintenanceWindow(
  value: unknown,
): value is MonitorMaintenanceWindow {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "affectedServiceIds",
      "startsAt",
      "endsAt",
    ]) &&
    isIdentifier(value.id) &&
    Array.isArray(value.affectedServiceIds) &&
    value.affectedServiceIds.every(isIdentifier) &&
    new Set(value.affectedServiceIds).size ===
      value.affectedServiceIds.length &&
    isTimestamp(value.startsAt) &&
    isTimestamp(value.endsAt) &&
    Date.parse(value.startsAt) < Date.parse(value.endsAt)
  );
}

function isResponseSample(value: unknown): value is MonitorResponseSample {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "serviceId",
      "checkId",
      "timestamp",
      "responseTimeMs",
    ]) &&
    isIdentifier(value.serviceId) &&
    isIdentifier(value.checkId) &&
    isTimestamp(value.timestamp) &&
    (value.responseTimeMs === null ||
      (typeof value.responseTimeMs === "number" &&
        Number.isFinite(value.responseTimeMs) &&
        value.responseTimeMs >= 0))
  );
}

function isRun(value: unknown): value is MonitorRun {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "kind", "startedAt", "completedAt"]) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 128 &&
    (value.kind === "uptime" || value.kind === "response") &&
    isTimestamp(value.startedAt) &&
    isTimestamp(value.completedAt) &&
    Date.parse(value.completedAt) >= Date.parse(value.startedAt)
  );
}

function retainProcessedRuns(
  runs: MonitorRun[],
  stateChanges: MonitorStateChange[],
  newestRunId: string,
): MonitorRun[] {
  const retainedRunIds = new Set(
    stateChanges.map(({ runId }) => runId),
  );
  retainedRunIds.add(newestRunId);
  return runs.filter(({ id }) => retainedRunIds.has(id));
}

function isPersistentState(value: unknown): value is MonitorPersistentState {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "monitoringStartedAt",
      "current",
      "stateChanges",
      "maintenanceWindows",
      "responseSamples",
      "documents",
      "schemaVersion",
      "processedRuns",
    ]) ||
    value.schemaVersion !== MONITOR_STATE_SCHEMA_VERSION ||
    !isTimestamp(value.monitoringStartedAt) ||
    !isRecord(value.current) ||
    !hasExactKeys(value.current, ["checks", "services"]) ||
    !Array.isArray(value.current.checks) ||
    !value.current.checks.every(isCheckState) ||
    !Array.isArray(value.current.services) ||
    !value.current.services.every(isServiceState) ||
    !Array.isArray(value.stateChanges) ||
    !value.stateChanges.every(isStateChange) ||
    !Array.isArray(value.maintenanceWindows) ||
    !value.maintenanceWindows.every(isMaintenanceWindow) ||
    !Array.isArray(value.responseSamples) ||
    !value.responseSamples.every(isResponseSample) ||
    !Array.isArray(value.processedRuns) ||
    !value.processedRuns.every(isRun) ||
    !isRecord(value.documents) ||
    !hasExactKeys(value.documents, ["status", "responseTimes"])
  ) {
    return false;
  }

  const processedRunIds = new Set<string>();
  let previousRunStartedAt = -1;
  for (const run of value.processedRuns) {
    const startedAt = Date.parse(run.startedAt);
    if (processedRunIds.has(run.id) || startedAt <= previousRunStartedAt) {
      return false;
    }
    processedRunIds.add(run.id);
    previousRunStartedAt = startedAt;
  }

  const checkIds = new Set<string>();
  for (const check of value.current.checks) {
    const identity = `${check.serviceId}\u0000${check.checkId}`;
    if (checkIds.has(identity)) {
      return false;
    }
    checkIds.add(identity);
  }

  const serviceIds = new Set<string>();
  for (const service of value.current.services) {
    if (serviceIds.has(service.serviceId)) {
      return false;
    }
    serviceIds.add(service.serviceId);
  }

  let previousChangeAt = -1;
  const stateChangeIds = new Set<string>();
  for (const change of value.stateChanges) {
    const changedAt = Date.parse(change.changedAt);
    const identity = `${change.runId}\u0000${change.serviceId}`;
    if (
      changedAt < previousChangeAt ||
      stateChangeIds.has(identity) ||
      !processedRunIds.has(change.runId)
    ) {
      return false;
    }
    previousChangeAt = changedAt;
    stateChangeIds.add(identity);
  }

  let previousSampleAt = -1;
  const sampleIds = new Set<string>();
  for (const sample of value.responseSamples) {
    const timestamp = Date.parse(sample.timestamp);
    const identity = `${sample.serviceId}\u0000${sample.checkId}\u0000${sample.timestamp}`;
    if (timestamp < previousSampleAt || sampleIds.has(identity)) {
      return false;
    }
    previousSampleAt = timestamp;
    sampleIds.add(identity);
  }

  const statusResult = validateStatusDocument(value.documents.status);
  const responseTimesResult = validateResponseTimesDocument(
    value.documents.responseTimes,
  );
  return (
    statusResult.success &&
    responseTimesResult.success &&
    statusResult.data.monitoringStartedAt === value.monitoringStartedAt &&
    responseTimesResult.data.monitoringStartedAt === value.monitoringStartedAt
  );
}

async function removeIfPresent(path: string | null): Promise<void> {
  if (path === null) {
    return;
  }
  await unlink(path).catch((error: NodeError) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}

export async function readMonitorState(
  path: string,
): Promise<MonitorPersistentState | null> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeError).code === "ENOENT") {
      return null;
    }
    throw new MonitorStateStoreError("STATE_READ_FAILED");
  }

  try {
    const value = migrateLegacyPersistentState(JSON.parse(source) as unknown);
    if (!isPersistentState(value)) {
      throw new MonitorStateStoreError("STATE_INVALID");
    }
    return value;
  } catch (error) {
    if (error instanceof MonitorStateStoreError) {
      throw error;
    }
    throw new MonitorStateStoreError("STATE_INVALID");
  }
}

export async function updateMonitorState(
  path: string,
  run: MonitorRun,
  update: (
    current: MonitorPersistentState | null,
  ) => MonitorStateContent | Promise<MonitorStateContent>,
  dependencies: MonitorStateStoreDependencies = {},
): Promise<MonitorStateUpdateResult> {
  const directory = dirname(path);
  const lockPath = `${path}.lock`;
  let temporaryPath: string | null = null;

  await mkdir(directory, { recursive: true });
  const lockHandle = await open(lockPath, "wx", 0o600).catch((error) => {
    if ((error as NodeError).code === "EEXIST") {
      throw new MonitorStateStoreError("STATE_LOCKED");
    }
    throw new MonitorStateStoreError("STATE_WRITE_FAILED");
  });

  try {
    const current = await readMonitorState(path);
    if (current !== null) {
      if (current.processedRuns.some(({ id }) => id === run.id)) {
        return { outcome: "duplicate", state: current };
      }
      const latestRun = current.processedRuns.reduce<MonitorRun | null>(
        (latest, storedRun) =>
          latest === null ||
          Date.parse(storedRun.startedAt) > Date.parse(latest.startedAt)
            ? storedRun
            : latest,
        null,
      );
      if (
        latestRun !== null &&
        Date.parse(run.startedAt) <= Date.parse(latestRun.startedAt)
      ) {
        return { outcome: "stale", state: current };
      }
    }
    const content = await update(current);
    const candidate = {
      ...content,
      schemaVersion: MONITOR_STATE_SCHEMA_VERSION,
      processedRuns: retainProcessedRuns(
        [...(current?.processedRuns ?? []), run],
        content.stateChanges,
        run.id,
      ),
    };
    const serialized = `${JSON.stringify(candidate, null, 2)}\n`;
    const parsed: unknown = JSON.parse(serialized);
    if (!isPersistentState(parsed)) {
      throw new MonitorStateStoreError("STATE_INVALID");
    }

    temporaryPath = join(
      directory,
      `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
    );
    const temporaryHandle = await open(temporaryPath, "wx", 0o600);
    try {
      await temporaryHandle.writeFile(serialized, "utf8");
      await temporaryHandle.sync();
    } finally {
      await temporaryHandle.close();
    }
    await dependencies.beforeReplace?.(temporaryPath);
    await rename(temporaryPath, path);
    temporaryPath = null;

    return { outcome: "written", state: parsed };
  } catch (error) {
    if (error instanceof MonitorStateStoreError) {
      throw error;
    }
    throw new MonitorStateStoreError("STATE_WRITE_FAILED");
  } finally {
    try {
      await removeIfPresent(temporaryPath);
    } finally {
      await lockHandle.close();
      await removeIfPresent(lockPath);
    }
  }
}
