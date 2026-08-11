/**
 * How a fixture is assembled, so seven cases can be written as seven
 * descriptions rather than seven hand-built documents.
 *
 * Everything it produces satisfies the product's own validators, not merely the
 * schemas: the timestamps stay inside the monitoring window, a day's monitored
 * time never exceeds the part of that day that had happened, samples are
 * ordered and unique, and a maintenance window's state agrees with the moment
 * the document was generated. A fixture that broke any of those would be a
 * document Velvet refuses, and a design proved against one would be proved
 * against nothing.
 */

import type {
  IncidentsDocument,
  ResponseTimesDocument,
  StatusDocument,
} from "@velvet/contracts";

import {
  BUNDLE_DATA_VERSION,
  type BundleData,
  type BundleSite,
} from "../../src/lib/bundles/data.js";

const DAY_MS = 86_400_000;
const SECONDS_PER_DAY = 86_400;

/** One service, described by what it did rather than by its documents. */
export interface ServiceSpec {
  id: string;
  name: string;
  status: StatusDocument["services"][number]["status"];
  protocols: Array<"ipv4" | "ipv6">;
  /** What a check currently reports, in milliseconds, or null where it failed. */
  responseTimeMs?: number | null;
  /** Seconds lost, by how many days ago the day was. */
  outages?: Record<number, number>;
  /** Days, counted back from the generation day, with no measurement at all. */
  gaps?: number[];
}

/** A whole installation, described. */
export interface FixtureSpec {
  /** The moment the page is rendered as though it were now. */
  generatedAt: string;
  /** How many days of history exist. One is an installation's first day. */
  monitoringDays: number;
  services: ServiceSpec[];
  events?: IncidentsDocument["events"];
  /** Anything about the installation that differs from the defaults below. */
  site?: Partial<BundleSite>;
}

/** The installation every fixture starts from, before its own overrides. */
const DEFAULT_SITE: BundleSite = {
  name: "Velvet Underground Inc.",
  navigation: [
    { title: "Website", href: "#" },
    { title: "Documentation", href: "#" },
    { title: "Support", href: "#" },
  ],
  layout: "grouped",
  defaultRange: "month",
  serial: 42,
  version: "1.5.4",
  icons: {},
  configuredAt: {
    label: "setup.velvet.li/configurator",
    href: "https://setup.velvet.li/configurator/",
  },
};

/** Midnight UTC of the day a moment falls on. */
function midnight(moment: string): number {
  return Date.parse(`${moment.slice(0, 10)}T00:00:00.000Z`);
}

/** The date `daysAgo` days before the generation day, as `YYYY-MM-DD`. */
function dateKey(generatedAt: string, daysAgo: number): string {
  return new Date(midnight(generatedAt) - daysAgo * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** When monitoring began, given how many days of history the fixture has. */
export function monitoringStartOf(spec: FixtureSpec): string {
  return new Date(
    midnight(spec.generatedAt) - (spec.monitoringDays - 1) * DAY_MS,
  ).toISOString();
}

/**
 * One service's day-by-day availability.
 *
 * A day with no measurement is absent rather than zero, because the two mean
 * different things: an absent day was never recorded, whilst a present day with
 * no lost time was recorded as working.
 */
function availabilityFor(
  spec: FixtureSpec,
  service: ServiceSpec,
): StatusDocument["services"][number]["dailyAvailability"] {
  const generatedAt = Date.parse(spec.generatedAt);
  const today = midnight(spec.generatedAt);
  const days: StatusDocument["services"][number]["dailyAvailability"] = [];
  for (let daysAgo = spec.monitoringDays - 1; daysAgo >= 0; daysAgo -= 1) {
    if (service.gaps?.includes(daysAgo)) continue;
    // The generation day is only monitored as far as the generation moment, and
    // counting a whole day there would report uptime over hours that have not
    // happened.
    const monitoredSeconds =
      daysAgo === 0
        ? Math.max(1, Math.floor((generatedAt - today) / 1_000))
        : SECONDS_PER_DAY;
    const unavailableSeconds = Math.min(
      service.outages?.[daysAgo] ?? 0,
      monitoredSeconds,
    );
    days.push({
      date: dateKey(spec.generatedAt, daysAgo),
      monitoredSeconds,
      unavailableSeconds,
    });
  }
  return days;
}

/** The status document a fixture describes. */
export function buildStatus(spec: FixtureSpec): StatusDocument {
  return {
    schemaVersion: 1,
    generatedAt: spec.generatedAt,
    monitoringStartedAt: monitoringStartOf(spec),
    services: spec.services.map((service) => ({
      id: service.id,
      name: service.name,
      status: service.status,
      checks: service.protocols.map((protocol) => ({
        id: `${service.id}-${protocol}`,
        protocol,
        status: service.status,
        checkedAt: service.status === "unknown" ? null : spec.generatedAt,
        responseTimeMs:
          service.responseTimeMs === undefined
            ? service.status === "outage" || service.status === "unknown"
              ? null
              : 120
            : service.responseTimeMs,
      })),
      dailyAvailability: availabilityFor(spec, service),
    })),
  };
}

/**
 * The response-time document a fixture describes.
 *
 * Three-hourly over the last two days, or over the whole window where that is
 * shorter, which is enough for a chart to have a shape without making a fixture
 * a megabyte.
 */
export function buildResponseTimes(spec: FixtureSpec): ResponseTimesDocument {
  const generatedAt = Date.parse(spec.generatedAt);
  const monitoringStartedAt = Date.parse(monitoringStartOf(spec));
  const oldest = Math.max(monitoringStartedAt, generatedAt - 2 * DAY_MS);
  const stamps: number[] = [];
  for (let moment = oldest; moment <= generatedAt; moment += 3 * 3_600_000) {
    stamps.push(moment);
  }

  return {
    schemaVersion: 1,
    generatedAt: spec.generatedAt,
    monitoringStartedAt: monitoringStartOf(spec),
    series: spec.services.flatMap((service) =>
      service.protocols.map((protocol) => ({
        serviceId: service.id,
        checkId: `${service.id}-${protocol}`,
        protocol,
        samples: stamps.map((moment, index) => ({
          timestamp: new Date(moment).toISOString(),
          responseTimeMs:
            service.status === "unknown"
              ? null
              : Math.round(
                  (service.responseTimeMs ?? 120) *
                    (protocol === "ipv6" ? 1.12 : 1) *
                    (1 + 0.12 * Math.sin(index / 3)),
                ),
        })),
      })),
    ),
  };
}

/** Assembles a whole fixture in the shape a bundle is handed. */
export function buildFixture(spec: FixtureSpec): BundleData {
  return {
    dataVersion: BUNDLE_DATA_VERSION,
    generatedAt: spec.generatedAt,
    site: { ...DEFAULT_SITE, ...spec.site },
    status: buildStatus(spec),
    incidents: {
      schemaVersion: 1,
      generatedAt: spec.generatedAt,
      events: spec.events ?? [],
    },
    responseTimes: buildResponseTimes(spec),
  };
}
