import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  barsForRange,
  overallStatus,
  uptimeForRange,
  visibleIncidentEvents,
} from "../src/lib/data.js";
import type { IncidentEvent, Service } from "../src/lib/types.js";

const service: Service = {
  id: "website",
  name: "Website",
  status: "outage",
  checks: [
    {
      id: "ipv4",
      protocol: "ipv4",
      status: "outage",
      checkedAt: "2026-07-27T12:00:00.000Z",
      responseTimeMs: 450,
    },
  ],
  dailyAvailability: [
    {
      date: "2026-07-26",
      monitoredSeconds: 86_400,
      unavailableSeconds: 3_600,
    },
    {
      date: "2026-07-27",
      monitoredSeconds: 43_200,
      unavailableSeconds: 20_000,
    },
  ],
};

test("derives uptime bars from Velvet daily availability", () => {
  const bars = barsForRange(
    service,
    "week",
    "2026-07-27T12:00:00.000Z",
    "2026-07-26T00:00:00.000Z",
  );

  assert.equal(bars.length, 7);
  assert.equal(bars[4]?.hasData, false);
  assert.deepEqual(bars.slice(-2).map(({ status, minutesDown, hasData }) => ({
    status,
    minutesDown,
    hasData,
  })), [
    { status: "degraded", minutesDown: 60, hasData: true },
    { status: "outage", minutesDown: 333, hasData: true },
  ]);
});

test("computes range uptime from monitored and unavailable seconds", () => {
  assert.equal(
    uptimeForRange(
      service,
      "week",
      "2026-07-27T12:00:00.000Z",
      "2026-07-26T00:00:00.000Z",
    ),
    "81.79%",
  );
});

test("rolls up Velvet service status by severity", () => {
  assert.equal(overallStatus([]), "unknown");
  assert.equal(overallStatus([{ ...service, status: "operational" }]), "operational");
  assert.equal(overallStatus([{ ...service, status: "unknown" }]), "unknown");
  assert.equal(overallStatus([{ ...service, status: "degraded" }]), "degraded");
  assert.equal(overallStatus([service]), "outage");
});

test("keeps only active incident and maintenance events", () => {
  const events: IncidentEvent[] = [
    {
      id: "resolved-incident",
      kind: "incident",
      state: "resolved",
      title: "Resolved incident",
      summary: "",
      affectedServiceIds: ["website"],
      startsAt: "2026-07-27T08:00:00.000Z",
      endsAt: "2026-07-27T09:00:00.000Z",
    },
    {
      id: "scheduled-maintenance",
      kind: "maintenance",
      state: "scheduled",
      title: "Scheduled maintenance",
      summary: "",
      affectedServiceIds: ["website"],
      startsAt: "2026-07-28T08:00:00.000Z",
      endsAt: "2026-07-28T09:00:00.000Z",
    },
    {
      id: "open-incident",
      kind: "incident",
      state: "open",
      title: "Open incident",
      summary: "",
      affectedServiceIds: ["website"],
      startsAt: "2026-07-27T10:00:00.000Z",
      endsAt: null,
    },
  ];

  assert.deepEqual(
    visibleIncidentEvents(events).map(({ id }) => id),
    ["open-incident", "scheduled-maintenance"],
  );
});

test("marks completed maintenance on the affected service day without changing availability", () => {
  const maintenance: IncidentEvent = {
    id: "maintenance-13",
    kind: "maintenance",
    state: "completed",
    title: "Website maintenance",
    summary: "Production verification.",
    affectedServiceIds: ["website"],
    startsAt: "2026-07-27T10:00:00.000Z",
    endsAt: "2026-07-27T10:30:00.000Z",
  };
  const operationalService: Service = {
    ...service,
    status: "operational",
    dailyAvailability: [
      {
        date: "2026-07-27",
        monitoredSeconds: 43_200,
        unavailableSeconds: 0,
      },
    ],
  };

  const [day] = barsForRange(
    operationalService,
    "day",
    "2026-07-27T12:00:00.000Z",
    "2026-07-26T00:00:00.000Z",
    [maintenance],
  );

  assert.equal(day?.status, "operational");
  assert.deepEqual(
    day?.maintenance.map(({ id, title, startsAt, endsAt }) => ({
      id,
      title,
      startsAt,
      endsAt,
    })),
    [
      {
        id: "maintenance-13",
        title: "Website maintenance",
        startsAt: "2026-07-27T10:00:00.000Z",
        endsAt: "2026-07-27T10:30:00.000Z",
      },
    ],
  );
  assert.equal(
    uptimeForRange(
      operationalService,
      "day",
      "2026-07-27T12:00:00.000Z",
      "2026-07-26T00:00:00.000Z",
    ),
    "100.00%",
  );
});

test("keeps outage priority and deduplicates maintenance in aggregated bars", () => {
  const maintenance: IncidentEvent = {
    id: "maintenance-14",
    kind: "maintenance",
    state: "completed",
    title: "Cross-day maintenance",
    summary: "",
    affectedServiceIds: ["website"],
    startsAt: "2026-07-26T23:30:00.000Z",
    endsAt: "2026-07-27T00:30:00.000Z",
  };

  const bars = barsForRange(
    service,
    "year",
    "2026-07-27T12:00:00.000Z",
    "2026-07-26T00:00:00.000Z",
    [maintenance],
  );
  const latest = bars.at(-1);

  assert.equal(latest?.status, "outage");
  assert.deepEqual(latest?.maintenance.map(({ id }) => id), ["maintenance-14"]);
});
