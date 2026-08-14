/**
 * The seven cases every design is proved against, beside the ordinary one.
 *
 * They are not a sample of what installations look like. They are the shapes
 * that break a design, chosen from what actually broke one: most of the defects
 * found whilst building the six existing designs would have been caught by
 * "twenty services" and "very long names" alone.
 *
 * Each case is one sentence of intent followed by the smallest description that
 * produces it, because a fixture nobody can read is a fixture nobody updates.
 */

import { buildFixture, type FixtureSpec, type ServiceSpec } from "./build.js";
import type { ThemeData } from "../../src/lib/themes/data.js";

/** The moment every fixture is rendered as though it were now. */
export const FIXTURE_NOW = "2026-03-22T14:35:00.000Z";

/** Twenty services, named after what a real installation watches. */
const TWENTY = [
  "Website",
  "API",
  "CDN",
  "Mail",
  "Database",
  "Search",
  "Queue",
  "Cache",
  "Storage",
  "Auth",
  "Billing",
  "Webhooks",
  "Analytics",
  "Images",
  "Video",
  "Docs",
  "Status",
  "Backups",
  "Registry",
  "Gateway",
];

/** Two thousand characters of incident summary, as one sentence repeated. */
const LONG_SUMMARY = "The upstream relay is refusing connections on both protocols and outbound mail is queued rather than delivered. "
  .repeat(19)
  .slice(0, 2_000);

/** A description with everything the seven cases have in common filled in. */
function spec(partial: Omit<FixtureSpec, "generatedAt">): FixtureSpec {
  return { generatedAt: FIXTURE_NOW, ...partial };
}

/**
 * The ordinary installation, well.
 *
 * The one case that is neither a trap nor a page reporting trouble: five
 * services, three hundred days behind them, nothing wrong anywhere. Two things
 * need it. No design is otherwise proved against its own healthy state with a
 * full history, and the pictures the start page shows are taken here, because
 * four status pages reporting an outage is the wrong thing to greet anybody
 * with.
 *
 * The five services and their response times are the ordinary installation's,
 * so the two read as the same fictional company on a better day.
 */
export const allWell: ThemeData = buildFixture(
  spec({
    monitoringDays: 300,
    services: [
      { id: "website", name: "Website", status: "operational", protocols: ["ipv4", "ipv6"], responseTimeMs: 96 },
      { id: "api", name: "API", status: "operational", protocols: ["ipv4", "ipv6"], responseTimeMs: 128 },
      { id: "cdn", name: "CDN", status: "operational", protocols: ["ipv4"], responseTimeMs: 412 },
      { id: "mail", name: "Mail", status: "operational", protocols: ["ipv4", "ipv6"], responseTimeMs: 240 },
      { id: "database", name: "Database", status: "operational", protocols: ["ipv6"], responseTimeMs: 18 },
    ],
    site: {
      name: "Velvet Underground Inc.",
      // None, which is what a published installation shows unless its operator
      // wrote links into `velvet.yml` by hand.
      navigation: [],
      icons: {
        website: "globe",
        api: "brackets",
        cdn: "cloud",
        mail: "envelope",
        database: "database",
      },
    },
  }),
);

/**
 * The first day of an installation, with no history at all.
 *
 * The case that catches a design reporting a fresh installation as flawless:
 * there is one partial day of data, and every range longer than it has nothing
 * to average.
 */
export const firstDay: ThemeData = buildFixture(
  spec({
    monitoringDays: 1,
    services: [
      { id: "website", name: "Website", status: "operational", protocols: ["ipv4", "ipv6"] },
      { id: "api", name: "API", status: "operational", protocols: ["ipv4"] },
    ],
  }),
);

/**
 * A month carrying every state a day can be in.
 *
 * Days that answered, days that lost a little time, days that lost most of it,
 * and days that recorded nothing at all, all in one row. The case every other
 * fixture misses: those show a row of one state each, and none of them says
 * whether a reader could tell the four apart where they stand side by side.
 *
 * A day counts as an outage once it loses three tenths of what was monitored,
 * so the figures below are seconds of a full day: 1800 and 600 are degraded,
 * 43200 and 60000 are outages.
 */
export const everyDayState: ThemeData = buildFixture(
  spec({
    monitoringDays: 30,
    services: [
      {
        id: "website",
        name: "Website",
        status: "operational",
        protocols: ["ipv4", "ipv6"],
        responseTimeMs: 96,
        gaps: [3, 4, 11, 19, 26],
        outages: { 2: 1800, 8: 43200, 15: 600, 22: 60000 },
      },
      {
        id: "api",
        name: "API",
        status: "operational",
        protocols: ["ipv4"],
        responseTimeMs: 128,
        gaps: [1, 12, 13, 20, 27],
        outages: { 5: 900, 9: 54000, 17: 2400 },
      },
    ],
  }),
);

/**
 * Everything unknown.
 *
 * Nothing has answered, no response time exists, and every figure a design
 * would print is absent. A design that shows a reassuring green here is wrong.
 */
export const everythingUnknown: ThemeData = buildFixture(
  spec({
    monitoringDays: 30,
    services: [
      { id: "website", name: "Website", status: "unknown", protocols: ["ipv4", "ipv6"], gaps: Array.from({ length: 30 }, (_, index) => index) },
      { id: "api", name: "API", status: "unknown", protocols: ["ipv4"], gaps: Array.from({ length: 30 }, (_, index) => index) },
    ],
  }),
);

/** One service, which is what most installations start as. */
export const oneService: ThemeData = buildFixture(
  spec({
    monitoringDays: 90,
    services: [
      {
        id: "website",
        name: "Website",
        status: "operational",
        protocols: ["ipv4", "ipv6"],
        outages: { 12: 600 },
      },
    ],
  }),
);

/**
 * Twenty services.
 *
 * The case a design fails on by being laid out for five: a rail that runs the
 * height of the readout, a fixed viewport height, or a legend that assumed it
 * could name every service.
 */
export const twentyServices: ThemeData = buildFixture(
  spec({
    monitoringDays: 120,
    services: TWENTY.map((name, index): ServiceSpec => ({
      id: name.toLowerCase(),
      name,
      status:
        index % 7 === 3 ? "degraded" : index % 11 === 5 ? "outage" : "operational",
      protocols: index % 3 === 0 ? ["ipv4", "ipv6"] : ["ipv4"],
      outages: index % 4 === 0 ? { 3: 1_200, 40: 300 } : {},
    })),
  }),
);

/**
 * Very long service names.
 *
 * Every design that sets a service name on one line, in a column of a fixed
 * width, or beside a figure it expects to keep its place, fails here.
 */
export const longNames: ThemeData = buildFixture(
  spec({
    monitoringDays: 60,
    services: [
      {
        id: "primary-application-gateway",
        name: "Primary application gateway, Frankfurt am Main and Amsterdam",
        status: "operational",
        protocols: ["ipv4", "ipv6"],
      },
      {
        id: "asset-delivery",
        name: "Kundenspezifische Auslieferungsinfrastruktur für Bilddaten",
        status: "degraded",
        protocols: ["ipv4"],
        outages: { 1: 900 },
      },
      {
        id: "unbroken",
        name: "averyverylongsinglewordwithnobreakopportunityanywhereatallhere",
        status: "operational",
        protocols: ["ipv6"],
      },
    ],
  }),
);

/**
 * An incident summary of two thousand characters.
 *
 * A notice is written by whoever is having the bad day, and none of them counts
 * characters. A design that lets one summary push the services off the page has
 * chosen the wrong thing to be flexible.
 */
export const longSummary: ThemeData = buildFixture(
  spec({
    monitoringDays: 45,
    services: [
      {
        id: "mail",
        name: "Mail",
        status: "outage",
        protocols: ["ipv4", "ipv6"],
        outages: { 0: 20_000, 1: 86_400 },
      },
      { id: "website", name: "Website", status: "operational", protocols: ["ipv4"] },
    ],
    events: [
      {
        id: "mail-delivery-failure",
        kind: "incident",
        state: "open",
        title:
          "Mail delivery is failing for every outbound message on both protocols",
        summary: LONG_SUMMARY,
        affectedServiceIds: ["mail"],
        startsAt: "2026-03-22T01:35:00.000Z",
        endsAt: null,
      },
    ],
  }),
);

/**
 * A service reachable over IPv6 only.
 *
 * The case that catches a design assuming two protocols, or assuming the first
 * one is IPv4: a single badge, a single series in the chart, and a legend with
 * one entry.
 */
export const ipv6Only: ThemeData = buildFixture(
  spec({
    monitoringDays: 75,
    services: [
      {
        id: "database",
        name: "Database",
        status: "operational",
        protocols: ["ipv6"],
        responseTimeMs: 18,
        outages: { 23: 5_400 },
      },
    ],
  }),
);
