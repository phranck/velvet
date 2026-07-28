import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  validateIncidentsDocument,
  validateResponseTimesDocument,
  validateStatusDocument,
} from "../src/index.js";

test("accepts a dual-stack status document", () => {
  const document = {
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
  };

  assert.deepEqual(validateStatusDocument(document), {
    success: true,
    data: document,
  });
});

test("accepts available and unavailable response-time samples", () => {
  const document = {
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
  };

  assert.deepEqual(validateResponseTimesDocument(document), {
    success: true,
    data: document,
  });
});

test("accepts product-owned incident and maintenance events", () => {
  const document = {
    schemaVersion: 1,
    generatedAt: "2026-07-27T12:00:00.000Z",
    events: [
      {
        id: "incident-2026-07-27",
        kind: "incident",
        state: "open",
        title: "Intermittent API failures",
        summary: "Requests may fail while the issue is investigated.",
        affectedServiceIds: ["backend"],
        startsAt: "2026-07-27T11:30:00.000Z",
        endsAt: null,
      },
      {
        id: "maintenance-2026-07-28",
        kind: "maintenance",
        state: "scheduled",
        title: "Database maintenance",
        summary: "A short interruption is expected.",
        affectedServiceIds: ["database"],
        startsAt: "2026-07-28T01:00:00.000Z",
        endsAt: "2026-07-28T01:30:00.000Z",
      },
    ],
  };

  assert.deepEqual(validateIncidentsDocument(document), {
    success: true,
    data: document,
  });
});
