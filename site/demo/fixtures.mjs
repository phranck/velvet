/** Contract-valid Velvet data for the deterministic README screenshot. */

export const FIXED_NOW = "2026-07-28T12:05:00.000Z";
const STATUS_GENERATED_AT = "2026-07-28T12:00:00.000Z";

const DAY_MS = 86_400_000;
const RESPONSE_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const RESPONSE_SAMPLE_COUNT = 90 * 4 + 1;

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

function check(id, responseTimeMs, status = "operational") {
  return {
    id,
    protocol: "ipv4",
    status,
    checkedAt: STATUS_GENERATED_AT,
    responseTimeMs,
  };
}

function responseSamples(responseTimeMs, seed) {
  return Array.from({ length: RESPONSE_SAMPLE_COUNT }, (_, index) => {
    const timestamp = new Date(
      new Date(FIXED_NOW).getTime() -
        (RESPONSE_SAMPLE_COUNT - index - 1) * RESPONSE_INTERVAL_MS,
    ).toISOString();
    const unavailable =
      index > 0 &&
      index < RESPONSE_SAMPLE_COUNT - 1 &&
      (index + seed * 17) % 137 === 0;
    const wave =
      Math.sin((index + seed * 5) / 13) * responseTimeMs * 0.12 +
      Math.cos((index + seed * 3) / 31) * responseTimeMs * 0.06;
    const spike = (index + seed) % 89 === 0 ? responseTimeMs * 0.35 : 0;
    return {
      timestamp,
      responseTimeMs:
        unavailable
          ? null
          : index === RESPONSE_SAMPLE_COUNT - 1
            ? responseTimeMs
            : Math.max(1, Math.round(responseTimeMs + wave + spike)),
    };
  });
}

function service({
  id,
  name,
  responseTimeMs,
  status = "operational",
  outages = [],
}) {
  return {
    id,
    name,
    status,
    checks: [check(id, responseTimeMs, status)],
    dailyAvailability: dailyAvailability(outages),
  };
}

export const demoStatus = {
  schemaVersion: 1,
  generatedAt: STATUS_GENERATED_AT,
  monitoringStartedAt: "2025-01-01T00:00:00.000Z",
  services: [
    service({
      id: "website",
      name: "Website",
      responseTimeMs: 88,
    }),
    service({
      id: "api",
      name: "API",
      responseTimeMs: 142,
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
    }),
    service({
      id: "auth",
      name: "Auth",
      responseTimeMs: 612,
      status: "degraded",
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
  series: demoStatus.services.flatMap((serviceEntry, serviceIndex) =>
    serviceEntry.checks.map((checkEntry) => ({
      serviceId: serviceEntry.id,
      checkId: checkEntry.id,
      protocol: checkEntry.protocol,
      samples: responseSamples(
        checkEntry.responseTimeMs,
        serviceIndex + 1,
      ),
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
      startsAt: "2026-07-28T09:00:00.000Z",
      endsAt: null,
    },
  ],
};
