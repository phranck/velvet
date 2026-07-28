import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  type ContractValidationErrorCode,
  type ContractValidationResult,
  validateIncidentsDocument,
  validateResponseTimesDocument,
  validateStatusDocument,
} from "../src/index.js";

const createStatusDocument = () => ({
  schemaVersion: 1,
  generatedAt: "2026-07-27T12:00:00.000Z",
  monitoringStartedAt: "2026-07-01T00:00:00.000Z",
  services: [
    {
      id: "website",
      name: "Website",
      status: "operational",
      checks: [
        {
          id: "edge-primary",
          protocol: "ipv4",
          status: "operational",
          checkedAt: "2026-07-27T11:59:00.000Z",
          responseTimeMs: 108,
        },
        {
          id: "edge-secondary",
          protocol: "ipv6",
          status: "operational",
          checkedAt: "2026-07-27T11:59:05.000Z",
          responseTimeMs: 121,
        },
      ],
      dailyAvailability: [
        {
          date: "2026-07-26",
          monitoredSeconds: 86_400,
          unavailableSeconds: 0,
        },
      ],
    },
  ],
});

const createResponseTimesDocument = () => ({
  schemaVersion: 1,
  generatedAt: "2026-07-27T12:00:00.000Z",
  monitoringStartedAt: "2026-07-01T00:00:00.000Z",
  series: [
    {
      serviceId: "website",
      checkId: "edge-primary",
      protocol: "ipv4",
      samples: [
        {
          timestamp: "2026-07-27T11:58:00.000Z",
          responseTimeMs: 108,
        },
        {
          timestamp: "2026-07-27T11:59:00.000Z",
          responseTimeMs: null,
        },
      ],
    },
  ],
});

const createIncidentsDocument = () => ({
  schemaVersion: 1,
  generatedAt: "2026-07-27T12:00:00.000Z",
  events: [
    {
      id: "incident-2026-07-27",
      kind: "incident",
      state: "resolved",
      title: "Intermittent API failures",
      summary: "The service has recovered.",
      affectedServiceIds: ["backend"],
      startsAt: "2026-07-27T10:00:00.000Z",
      endsAt: "2026-07-27T10:30:00.000Z",
    },
  ],
});

function assertError(
  result: ContractValidationResult<unknown>,
  code: ContractValidationErrorCode,
  path: string,
) {
  assert.equal(result.success, false);
  if (result.success) {
    return;
  }

  assert.deepEqual(result.errors[0], {
    code,
    path,
    message: result.errors[0]?.message,
  });
}

test("rejects an incompatible schema version with a stable error", () => {
  const document = createStatusDocument();
  document.schemaVersion = 2;

  assertError(
    validateStatusDocument(document),
    "UNSUPPORTED_SCHEMA_VERSION",
    "/schemaVersion",
  );
});

test("rejects duplicate service identifiers with a stable error", () => {
  const document = createStatusDocument();
  document.services.push(structuredClone(document.services[0]!));

  assertError(
    validateStatusDocument(document),
    "DUPLICATE_SERVICE_ID",
    "/services/1/id",
  );
});

test("rejects duplicate check identifiers within a service", () => {
  const document = createStatusDocument();
  document.services[0]!.checks[1]!.id = "edge-primary";

  assertError(
    validateStatusDocument(document),
    "DUPLICATE_CHECK_ID",
    "/services/0/checks/1/id",
  );
});

test("rejects an invalid check protocol with a stable error", () => {
  const document = createStatusDocument();
  document.services[0]!.checks[0]!.protocol = "http";

  assertError(
    validateStatusDocument(document),
    "INVALID_PROTOCOL",
    "/services/0/checks/0/protocol",
  );
});

test("rejects a calendar-impossible timestamp with a stable error", () => {
  const document = createStatusDocument();
  document.generatedAt = "2026-02-30T12:00:00.000Z";

  assertError(
    validateStatusDocument(document),
    "INVALID_TIMESTAMP",
    "/generatedAt",
  );
});

test("rejects a negative monitored duration with a stable error", () => {
  const document = createStatusDocument();
  document.services[0]!.dailyAvailability[0]!.monitoredSeconds = -1;

  assertError(
    validateStatusDocument(document),
    "NEGATIVE_DURATION",
    "/services/0/dailyAvailability/0/monitoredSeconds",
  );
});

test("rejects daily history from before monitoring began", () => {
  const document = createStatusDocument();
  document.services[0]!.dailyAvailability[0]!.date = "2026-06-30";

  assertError(
    validateStatusDocument(document),
    "TIMESTAMP_OUT_OF_RANGE",
    "/services/0/dailyAvailability/0/date",
  );
});

test("rejects unavailable time that exceeds monitored time", () => {
  const document = createStatusDocument();
  document.services[0]!.dailyAvailability[0]!.monitoredSeconds = 60;
  document.services[0]!.dailyAvailability[0]!.unavailableSeconds = 61;

  assertError(
    validateStatusDocument(document),
    "INVALID_DURATION_RANGE",
    "/services/0/dailyAvailability/0/unavailableSeconds",
  );
});

test("rejects monitored time beyond the partial first day", () => {
  const document = createStatusDocument();
  document.monitoringStartedAt = "2026-07-26T12:00:00.000Z";
  document.generatedAt = "2026-07-27T12:00:00.000Z";
  document.services[0]!.dailyAvailability[0]!.date = "2026-07-26";
  document.services[0]!.dailyAvailability[0]!.monitoredSeconds = 43_201;

  assertError(
    validateStatusDocument(document),
    "INVALID_DURATION_RANGE",
    "/services/0/dailyAvailability/0/monitoredSeconds",
  );
});

test("rejects monitored time beyond the partial current day", () => {
  const document = createStatusDocument();
  document.monitoringStartedAt = "2026-07-26T12:00:00.000Z";
  document.generatedAt = "2026-07-27T12:00:00.000Z";
  document.services[0]!.dailyAvailability[0]!.date = "2026-07-27";
  document.services[0]!.dailyAvailability[0]!.monitoredSeconds = 43_201;

  assertError(
    validateStatusDocument(document),
    "INVALID_DURATION_RANGE",
    "/services/0/dailyAvailability/0/monitoredSeconds",
  );
});

test("rejects duplicate response-time series", () => {
  const document = createResponseTimesDocument();
  document.series.push(structuredClone(document.series[0]!));

  assertError(
    validateResponseTimesDocument(document),
    "DUPLICATE_RESPONSE_SERIES",
    "/series/1",
  );
});

test("rejects duplicate response-time sample timestamps", () => {
  const document = createResponseTimesDocument();
  document.series[0]!.samples[1]!.timestamp =
    document.series[0]!.samples[0]!.timestamp;

  assertError(
    validateResponseTimesDocument(document),
    "DUPLICATE_SAMPLE_TIMESTAMP",
    "/series/0/samples/1/timestamp",
  );
});

test("rejects duplicate incident identifiers", () => {
  const document = createIncidentsDocument();
  document.events.push(structuredClone(document.events[0]!));

  assertError(
    validateIncidentsDocument(document),
    "DUPLICATE_EVENT_ID",
    "/events/1/id",
  );
});

test("requires a resolved incident to have an end timestamp", () => {
  const document = createIncidentsDocument();
  document.events[0]!.endsAt = null as unknown as string;

  assertError(
    validateIncidentsDocument(document),
    "INVALID_EVENT_STATE",
    "/events/0/endsAt",
  );
});

test("rejects a maintenance window that ends before it starts", () => {
  const document = createIncidentsDocument();
  const event = document.events[0]!;
  event.id = "maintenance-2026-07-27";
  event.kind = "maintenance";
  event.state = "completed";
  event.startsAt = "2026-07-27T11:00:00.000Z";
  event.endsAt = "2026-07-27T10:30:00.000Z";

  assertError(
    validateIncidentsDocument(document),
    "TIMESTAMP_OUT_OF_RANGE",
    "/events/0/endsAt",
  );
});

test("rejects a scheduled maintenance window that already started", () => {
  const document = createIncidentsDocument();
  const event = document.events[0]!;
  event.id = "maintenance-2026-07-27";
  event.kind = "maintenance";
  event.state = "scheduled";
  event.startsAt = "2026-07-27T11:00:00.000Z";
  event.endsAt = "2026-07-27T13:00:00.000Z";

  assertError(
    validateIncidentsDocument(document),
    "INVALID_EVENT_STATE",
    "/events/0/startsAt",
  );
});

test("rejects an active maintenance window outside the generation time", () => {
  const document = createIncidentsDocument();
  const event = document.events[0]!;
  event.id = "maintenance-2026-07-27";
  event.kind = "maintenance";
  event.state = "active";
  event.startsAt = "2026-07-27T09:00:00.000Z";
  event.endsAt = "2026-07-27T10:00:00.000Z";

  assertError(
    validateIncidentsDocument(document),
    "INVALID_EVENT_STATE",
    "/events/0/endsAt",
  );
});

test("rejects a completed maintenance window in the future", () => {
  const document = createIncidentsDocument();
  const event = document.events[0]!;
  event.id = "maintenance-2026-07-28";
  event.kind = "maintenance";
  event.state = "completed";
  event.startsAt = "2026-07-28T09:00:00.000Z";
  event.endsAt = "2026-07-28T10:00:00.000Z";

  assertError(
    validateIncidentsDocument(document),
    "INVALID_EVENT_STATE",
    "/events/0/endsAt",
  );
});
