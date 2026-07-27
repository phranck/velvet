/** Contract-valid Velvet data for the deterministic README screenshot. */

export const FIXED_NOW = "2026-06-01T12:00:00.000Z";

const DAY_MS = 86_400_000;

function daysAgo(count) {
  return new Date(new Date(FIXED_NOW).getTime() - count * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function dailyAvailability(outages = []) {
  const unavailable = new Map(
    outages.map(({ daysAgo: count, minutes }) => [daysAgo(count), minutes * 60]),
  );
  return Array.from({ length: 90 }, (_, index) => {
    const count = 89 - index;
    const date = daysAgo(count);
    return {
      date,
      monitoredSeconds: count === 0 ? 43_200 : 86_400,
      unavailableSeconds: unavailable.get(date) ?? 0,
    };
  });
}

function check(id, protocol, responseTimeMs, status = "operational") {
  return { id, protocol, status, checkedAt: FIXED_NOW, responseTimeMs };
}

function service({
  id,
  name,
  responseTimeMs,
  ipv6ResponseTimeMs = null,
  status = "operational",
  ipv4Status = status,
  ipv6Status = "operational",
  outages = [],
}) {
  return {
    id,
    name,
    status,
    checks: [
      check(`${id}-ipv4`, "ipv4", responseTimeMs, ipv4Status),
      ...(ipv6ResponseTimeMs === null
        ? []
        : [check(`${id}-ipv6`, "ipv6", ipv6ResponseTimeMs, ipv6Status)]),
    ],
    dailyAvailability: dailyAvailability(outages),
  };
}

export const demoStatus = {
  schemaVersion: 1,
  generatedAt: FIXED_NOW,
  monitoringStartedAt: "2025-01-01T00:00:00.000Z",
  services: [
    service({
      id: "website",
      name: "Website",
      responseTimeMs: 88,
      ipv6ResponseTimeMs: 91,
    }),
    service({
      id: "api",
      name: "API",
      responseTimeMs: 142,
      ipv6ResponseTimeMs: 150,
      outages: [{ daysAgo: 19, minutes: 18 }],
    }),
    service({
      id: "database",
      name: "Database",
      responseTimeMs: 34,
    }),
    service({
      id: "cdn",
      name: "CDN",
      responseTimeMs: 22,
      ipv6ResponseTimeMs: 25,
    }),
    service({
      id: "auth",
      name: "Auth",
      responseTimeMs: 612,
      ipv6ResponseTimeMs: 280,
      status: "degraded",
      ipv4Status: "degraded",
      outages: [
        { daysAgo: 0, minutes: 86 },
        { daysAgo: 1, minutes: 64 },
        { daysAgo: 6, minutes: 41 },
      ],
    }),
    service({
      id: "mail",
      name: "Mail",
      responseTimeMs: 198,
    }),
  ],
};

export const demoResponseTimes = {
  schemaVersion: 1,
  generatedAt: FIXED_NOW,
  monitoringStartedAt: demoStatus.monitoringStartedAt,
  series: demoStatus.services.flatMap((serviceEntry) =>
    serviceEntry.checks.map((checkEntry) => ({
      serviceId: serviceEntry.id,
      checkId: checkEntry.id,
      protocol: checkEntry.protocol,
      samples: [
        {
          timestamp: checkEntry.checkedAt,
          responseTimeMs: checkEntry.responseTimeMs,
        },
      ],
    })),
  ),
};

export const demoIncidents = {
  schemaVersion: 1,
  generatedAt: FIXED_NOW,
  events: [
    {
      id: "auth-latency",
      kind: "incident",
      state: "open",
      title: "Elevated login latency in eu-west",
      summary: "The authentication service is under investigation.",
      affectedServiceIds: ["auth"],
      startsAt: "2026-06-01T09:00:00.000Z",
      endsAt: null,
    },
  ],
};
