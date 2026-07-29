import {
  CONTRACT_SCHEMA_VERSION,
  validateResponseTimesDocument,
  validateStatusDocument,
  type ResponseTimesDocument,
  type StatusDocument,
} from "@velvet/contracts";

import { deriveDailyAvailability } from "./history.js";
import { aggregateServiceStatus } from "./state-machine.js";
import type {
  MonitorCheckState,
  MonitorMaintenanceWindow,
  MonitorResponseSample,
  MonitorStateChange,
  MonitorStatus,
} from "./state.js";

export interface MonitorDocumentService {
  id: string;
  name: string;
  checks: MonitorCheckState[];
}

export interface MonitorStatusDocumentInput {
  generatedAt: string;
  monitoringStartedAt: string;
  retentionDays: number;
  services: MonitorDocumentService[];
  stateChanges: MonitorStateChange[];
  maintenanceWindows: MonitorMaintenanceWindow[];
}

export interface MonitorResponseTimesDocumentInput {
  generatedAt: string;
  monitoringStartedAt: string;
  services: MonitorDocumentService[];
  responseSamples: MonitorResponseSample[];
}

export interface MonitorDocumentsInput
  extends MonitorStatusDocumentInput,
    MonitorResponseTimesDocumentInput {}

export interface MonitorDocuments {
  status: StatusDocument;
  responseTimes: ResponseTimesDocument;
}

export type MonitorDocumentValidationErrorCode =
  | "INVALID_STATUS_DOCUMENT"
  | "INVALID_RESPONSE_TIMES_DOCUMENT";

export class MonitorDocumentValidationError extends Error {
  readonly code: MonitorDocumentValidationErrorCode;

  constructor(code: MonitorDocumentValidationErrorCode) {
    super(
      code === "INVALID_STATUS_DOCUMENT"
        ? "Generated status document failed contract validation"
        : "Generated response-time document failed contract validation",
    );
    this.name = "MonitorDocumentValidationError";
    this.code = code;
  }
}

function publicStatus(
  status: MonitorStatus,
): "operational" | "degraded" | "outage" | "unknown" {
  switch (status) {
    case "up":
      return "operational";
    case "degraded":
      return "degraded";
    case "down":
      return "outage";
    case "unavailable":
      return "unknown";
  }
}

export function createStatusDocument(
  input: MonitorStatusDocumentInput,
): StatusDocument {
  const status: StatusDocument = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    monitoringStartedAt: input.monitoringStartedAt,
    services: input.services.map((service) => ({
      id: service.id,
      name: service.name,
      status: publicStatus(aggregateServiceStatus(service.checks)),
      checks: service.checks.map((check) => ({
        id: check.checkId,
        protocol: "ipv4",
        status: publicStatus(check.status),
        checkedAt: check.checkedAt,
        responseTimeMs: check.responseTimeMs,
      })),
      dailyAvailability: deriveDailyAvailability({
        serviceId: service.id,
        monitoringStartedAt: input.monitoringStartedAt,
        generatedAt: input.generatedAt,
        retentionDays: input.retentionDays,
        stateChanges: input.stateChanges,
        maintenanceWindows: input.maintenanceWindows,
      }),
    })),
  };

  if (!validateStatusDocument(status).success) {
    throw new MonitorDocumentValidationError("INVALID_STATUS_DOCUMENT");
  }

  return status;
}

export function createResponseTimesDocument(
  input: MonitorResponseTimesDocumentInput,
): ResponseTimesDocument {
  const responseTimes: ResponseTimesDocument = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    monitoringStartedAt: input.monitoringStartedAt,
    series: input.services.flatMap((service) =>
      service.checks.map((check) => ({
        serviceId: service.id,
        checkId: check.checkId,
        protocol: "ipv4" as const,
        samples: input.responseSamples
          .filter(
            (sample) =>
              sample.serviceId === service.id &&
              sample.checkId === check.checkId,
          )
          .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
          .map((sample) => ({
            timestamp: sample.timestamp,
            responseTimeMs: sample.responseTimeMs,
          })),
      })),
    ),
  };

  if (!validateResponseTimesDocument(responseTimes).success) {
    throw new MonitorDocumentValidationError(
      "INVALID_RESPONSE_TIMES_DOCUMENT",
    );
  }

  return responseTimes;
}

export function createMonitorDocuments(
  input: MonitorDocumentsInput,
): MonitorDocuments {
  return {
    status: createStatusDocument(input),
    responseTimes: createResponseTimesDocument(input),
  };
}
