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
      responseTimeMs: 156,
      // A single outage well in the past. The bars stay honest about a service
      // having had a bad day without the page itself announcing a problem, which
      // is not what a first-time visitor should be shown.
      outages: [{ daysAgo: 41, minutes: 27 }],
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

/**
 * A scheduled maintenance window rather than an open incident.
 *
 * Both are drawn from the same panel, so one event is enough to show that
 * Velvet surfaces them at all. Maintenance is the one to show, because it
 * leaves every service operational and therefore lets the page read as healthy
 * whilst still demonstrating the feature. An open incident would put "Some
 * systems degraded" across the top of the picture the README and the website
 * both use to introduce the product.
 */
export const demoIncidents = {
  schemaVersion: 1,
  generatedAt: FIXED_NOW,
  events: [
    {
      id: "database-upgrade",
      kind: "maintenance",
      state: "scheduled",
      title: "Database upgrade in eu-west",
      summary: "Brief connection resets are expected while the primary fails over.",
      affectedServiceIds: ["database"],
      startsAt: "2026-08-04T22:00:00.000Z",
      endsAt: "2026-08-04T23:30:00.000Z",
    },
  ],
};
