/**
 * The data every mockup renders from.
 *
 * Shaped against `packages/contracts/src/schemas.ts` rather than invented, so a
 * mockup exercises the same document a published page does. `verify.ts` checks
 * that claim against the real validators; a fixture that drifts from the schema
 * would make a theme look correct whilst the product it describes renders
 * something else.
 *
 * Deterministic, because two people looking at the same mockup have to see the
 * same page. Random data would also make the screenshot gate in
 * `documentation/theme-authoring.md` impossible, since every run would differ.
 */

import type {
  IncidentsDocument,
  ResponseTimesDocument,
  StatusDocument,
} from "@velvet/contracts";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const SECONDS_PER_DAY = 86_400;

/**
 * The moment every mockup is rendered as though it were now.
 *
 * Fixed rather than taken from the clock. The strip labels days, the chart
 * labels hours, and both would otherwise move between two screenshots of an
 * unchanged theme.
 */
export const GENERATED_AT = "2026-03-22T14:35:00.000Z";

/** How long this fictional installation has been monitoring. */
const MONITORING_DAYS = 300;

/**
 * A small integer hash, used wherever a value should look irregular whilst
 * staying the same on every run.
 *
 * @param seed - Any number; consecutive seeds give unrelated results.
 * @returns A number from 0 up to but excluding 1.
 */
function noise(seed: number): number {
  const mixed = Math.sin(seed * 12.9898) * 43_758.5453;
  return mixed - Math.floor(mixed);
}

/** The generation moment as a number, since everything below counts back from it. */
const now = Date.parse(GENERATED_AT);

/** Midnight UTC of the day the page was generated on. */
const today = Date.parse(`${GENERATED_AT.slice(0, 10)}T00:00:00.000Z`);

/**
 * The date `daysAgo` days before the generation date, as `YYYY-MM-DD`.
 *
 * @param daysAgo - How far back to count. Zero is the generation date itself.
 * @returns The date in the form `dailyAvailability` requires.
 */
function dateKey(daysAgo: number): string {
  return new Date(today - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

/** How a service behaves, so each one tells a different part of the story. */
interface ServicePlan {
  id: string;
  name: string;
  protocols: Array<"ipv4" | "ipv6">;
  /** Current state of every check on the service. */
  status: StatusDocument["services"][number]["status"];
  /** Typical response time in milliseconds, before the daily variation. */
  baseline: number;
  /** Days on which the service lost time, as days-ago mapped to seconds lost. */
  outages: Record<number, number>;
  /** Days with no measurement at all, in addition to the pre-monitoring gap. */
  gaps: number[];
}

/**
 * The five services, chosen to cover every state the strip and the hero can
 * show: healthy, briefly degraded, repeatedly degraded, currently down, and one
 * that carries a maintenance window.
 */
const PLANS: ServicePlan[] = [
  {
    id: "website",
    name: "Website",
    protocols: ["ipv4", "ipv6"],
    status: "operational",
    baseline: 96,
    outages: { 214: 180 },
    gaps: [],
  },
  {
    id: "api",
    name: "API",
    protocols: ["ipv4", "ipv6"],
    status: "operational",
    baseline: 128,
    outages: { 16: 2_520, 47: 480, 129: 90 },
    gaps: [],
  },
  {
    id: "cdn",
    name: "CDN",
    protocols: ["ipv4"],
    status: "degraded",
    baseline: 412,
    outages: { 2: 900, 3: 1_260, 9: 600, 34: 240, 88: 1_020, 190: 300 },
    gaps: [],
  },
  {
    id: "mail",
    name: "Mail",
    protocols: ["ipv4", "ipv6"],
    status: "outage",
    baseline: 240,
    outages: { 0: 41_400, 1: 86_400, 61: 3_600 },
    gaps: [],
  },
  {
    id: "database",
    name: "Database",
    protocols: ["ipv6"],
    status: "operational",
    baseline: 18,
    outages: { 23: 5_400 },
    gaps: [118, 119, 120, 121],
  },
];

/**
 * One service's day-by-day availability, from the start of monitoring until the
 * generation date.
 *
 * A day the service was not yet monitored on is absent rather than zero,
 * because `barsForRange` in `site/src/lib/data.ts` distinguishes the two: an
 * absent day is drawn as no data, whilst a present one with no lost time is
 * drawn as operational.
 *
 * @param plan - The service to build the history for.
 * @returns The entries `dailyAvailability` takes, oldest first.
 */
function availabilityFor(
  plan: ServicePlan,
): StatusDocument["services"][number]["dailyAvailability"] {
  const days: StatusDocument["services"][number]["dailyAvailability"] = [];
  for (let daysAgo = MONITORING_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
    if (plan.gaps.includes(daysAgo)) continue;
    // The current day is only monitored up to the generation moment, so it has
    // fewer seconds than a finished one. Anything else would make today's
    // uptime read against a day that has not happened yet.
    const monitoredSeconds =
      daysAgo === 0
        ? Math.round((now - today) / 1_000)
        : SECONDS_PER_DAY;
    const unavailableSeconds = Math.min(
      plan.outages[daysAgo] ?? 0,
      monitoredSeconds,
    );
    days.push({ date: dateKey(daysAgo), monitoredSeconds, unavailableSeconds });
  }
  return days;
}

/**
 * The checks a service currently reports.
 *
 * IPv6 answers a little slower than IPv4 here, which is the ordinary case on
 * most networks and makes the two series in the chart distinguishable without
 * relying on colour alone.
 *
 * @param plan - The service to build the checks for.
 * @returns One check per protocol the service is watched over.
 */
function checksFor(
  plan: ServicePlan,
): StatusDocument["services"][number]["checks"] {
  return plan.protocols.map((protocol) => ({
    id: `${plan.id}-${protocol}`,
    protocol,
    status: plan.status,
    checkedAt: plan.status === "outage" ? null : GENERATED_AT,
    responseTimeMs:
      plan.status === "outage"
        ? null
        : Math.round(plan.baseline * (protocol === "ipv6" ? 1.12 : 1)),
  }));
}

export const statusDocument: StatusDocument = {
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  monitoringStartedAt: new Date(
    today - (MONITORING_DAYS - 1) * DAY_MS,
  ).toISOString(),
  services: PLANS.map((plan) => ({
    id: plan.id,
    name: plan.name,
    status: plan.status,
    checks: checksFor(plan),
    dailyAvailability: availabilityFor(plan),
  })),
};

/**
 * When response-time samples were taken, densest at the near end.
 *
 * A real installation checks every five minutes, which is 105 120 samples a
 * year for one check, and no page loads that. The resolution therefore drops
 * with age: fifteen minutes over the last two days, two hours over the last
 * month, twelve hours before that. That is roughly 1 200 samples per series,
 * which every range can be drawn from whilst staying small enough to filter on
 * each range change.
 *
 * The chart reduces whatever it gets to 96 points through
 * `downsampleResponseSamples`, so a denser fixture would change nothing that
 * can be seen and would only cost time.
 *
 * @returns Sample times in milliseconds, oldest first.
 */
function sampleTimes(): number[] {
  const times: number[] = [];
  // Never earlier than monitoring began. The contract validator rejects a
  // sample outside the document's own monitoring window with
  // TIMESTAMP_OUT_OF_RANGE, and it is right to: a measurement from before the
  // first check claims to know something nobody recorded.
  const monitoringStart = Date.parse(statusDocument.monitoringStartedAt);
  const oldest = Math.min(365 * DAY_MS, now - monitoringStart);
  for (let age = oldest; age > 30 * DAY_MS; age -= 12 * HOUR_MS) {
    times.push(now - age);
  }
  for (let age = 30 * DAY_MS; age > 2 * DAY_MS; age -= 2 * HOUR_MS) {
    times.push(now - age);
  }
  for (let age = 2 * DAY_MS; age >= 0; age -= 15 * MINUTE_MS) {
    times.push(now - age);
  }
  return times;
}

const TIMES = sampleTimes();

/**
 * Whether a sample is missing, so the chart has gaps to break its line over.
 *
 * A missing sample is not the same as a slow one, and
 * `ResponseTimeChart.svelte` draws nothing across it rather than joining the
 * two sides. Without at least one gap in the fixture, no theme would ever show
 * how it handles the case.
 *
 * @param plan - The service the sample belongs to.
 * @param time - When the sample was taken.
 * @returns True where the measurement failed.
 */
function isMissing(plan: ServicePlan, time: number): boolean {
  const daysAgo = Math.floor((today - time) / DAY_MS + 1);
  const lostSeconds = plan.outages[daysAgo] ?? 0;
  if (lostSeconds >= SECONDS_PER_DAY) return true;
  if (lostSeconds > 0) return noise(time / HOUR_MS) < lostSeconds / SECONDS_PER_DAY;
  return false;
}

export const responseTimesDocument: ResponseTimesDocument = {
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  monitoringStartedAt: statusDocument.monitoringStartedAt,
  series: PLANS.flatMap((plan) =>
    plan.protocols.map((protocol) => ({
      serviceId: plan.id,
      checkId: `${plan.id}-${protocol}`,
      protocol,
      samples: TIMES.map((time, index) => ({
        timestamp: new Date(time).toISOString(),
        responseTimeMs: isMissing(plan, time)
          ? null
          : Math.round(
              plan.baseline *
                (protocol === "ipv6" ? 1.12 : 1) *
                // A slow drift plus a small jitter, so the curve has a shape
                // rather than being a noisy band.
                (1 + 0.18 * Math.sin(index / 37) + 0.08 * (noise(index) - 0.5)),
            ),
      })),
    })),
  ),
};

export const incidentsDocument: IncidentsDocument = {
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  events: [
    {
      id: "mail-delivery-failure",
      kind: "incident",
      state: "open",
      title: "Mail delivery is failing",
      summary:
        "Outbound mail is queued and not delivered. The upstream relay is refusing connections on both protocols.",
      affectedServiceIds: ["mail"],
      startsAt: new Date(now - 13 * HOUR_MS).toISOString(),
      endsAt: null,
    },
    {
      id: "database-upgrade",
      kind: "maintenance",
      state: "scheduled",
      title: "Database engine upgrade",
      summary:
        "The database moves to the next major version. Reads stay available throughout; writes pause for about twenty minutes.",
      affectedServiceIds: ["database"],
      startsAt: new Date(today + 2 * DAY_MS + 2 * HOUR_MS).toISOString(),
      endsAt: new Date(today + 2 * DAY_MS + 5 * HOUR_MS).toISOString(),
    },
    {
      // Completed, so `visibleIncidentEvents` keeps it out of the notice above
      // the cards whilst `barsForRange` still marks the days it covered. That
      // pair is what a theme has to get right: a maintenance day looks
      // different from an outage day even though both interrupted the service.
      id: "cdn-edge-migration",
      kind: "maintenance",
      state: "completed",
      title: "Edge node migration",
      summary: "Traffic moved to the new edge nodes, region by region.",
      affectedServiceIds: ["cdn"],
      startsAt: new Date(today - 9 * DAY_MS).toISOString(),
      endsAt: new Date(today - 8 * DAY_MS + 6 * HOUR_MS).toISOString(),
    },
  ],
};

/**
 * The configuration the mockups render under.
 *
 * Only the fields the page reads are set. It is not passed through
 * `loadConfig`, because that function fetches `config.json` over the network,
 * and a mockup has no server to fetch from.
 */
export const mockConfig = {
  name: "Orbital Systems",
  layout: "grouped" as const,
  defaultRange: "month" as const,
  navigation: [
    { title: "Website", href: "#" },
    { title: "Documentation", href: "#" },
    { title: "Support", href: "#" },
  ],
  serial: 42,
  version: "1.5.3",
  icons: {
    website: "globe",
    api: "brackets",
    cdn: "cloud",
    mail: "envelope",
    database: "database",
  } as Record<string, string>,
};
