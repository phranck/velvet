import type {
  ResponseTimesDocument,
  StatusDocument,
} from "@velvet/contracts";

import type { CheckFailureCode } from "./types.js";
import type { TargetAvailability } from "./orchestrator.js";

export type MonitorStatus = "up" | "degraded" | "down" | "unavailable";

export interface MonitorThresholds {
  failureThreshold: number;
  recoveryThreshold: number;
}

export interface MonitorCheckState {
  serviceId: string;
  checkId: string;
  status: MonitorStatus;
  confirmedStatus: "up" | "down" | null;
  confirmedAt: string | null;
  targetAvailability: TargetAvailability;
  failureStreak: number;
  recoveryStreak: number;
  checkedAt: string | null;
  responseTimeMs: number | null;
  statusCode: number | null;
  failureCode: CheckFailureCode | null;
}

export interface MonitorServiceState {
  serviceId: string;
  status: MonitorStatus;
  targetAvailability: TargetAvailability;
}

export interface MonitorStateChange {
  runId: string;
  serviceId: string;
  changedAt: string;
  status: MonitorStatus;
  targetAvailability: TargetAvailability;
}

export interface MonitorMaintenanceWindow {
  id: string;
  affectedServiceIds: string[];
  startsAt: string;
  endsAt: string;
}

export interface MonitorDailyAvailability {
  date: string;
  monitoredSeconds: number;
  unavailableSeconds: number;
}

export interface MonitorResponseSample {
  serviceId: string;
  checkId: string;
  timestamp: string;
  responseTimeMs: number | null;
}

export const MONITOR_STATE_SCHEMA_VERSION = 5 as const;

export interface MonitorRun {
  id: string;
  kind: "uptime" | "response";
  startedAt: string;
  completedAt: string;
}

export interface MonitorStateContent {
  monitoringStartedAt: string;
  current: {
    checks: MonitorCheckState[];
    services: MonitorServiceState[];
  };
  stateChanges: MonitorStateChange[];
  maintenanceWindows: MonitorMaintenanceWindow[];
  responseSamples: MonitorResponseSample[];
  documents: {
    status: StatusDocument;
    responseTimes: ResponseTimesDocument;
  };
}

export interface MonitorPersistentState extends MonitorStateContent {
  schemaVersion: typeof MONITOR_STATE_SCHEMA_VERSION;
  processedRuns: MonitorRun[];
}
