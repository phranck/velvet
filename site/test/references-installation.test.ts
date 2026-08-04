import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  describeInstallation,
  stateLabel,
  watchingSince,
} from "../src/references/installation";

/**
 * Covers what the gallery reads from an installation and what it does when an
 * installation will not answer.
 *
 * The setup service discloses a name and an address. Everything else a card
 * shows is read from the installation's own published files by the browser, so
 * every failure a network can produce is a case this has to have an answer for.
 */

const PAGE = "https://example.github.io/status/";
const DATA = "https://raw.githubusercontent.com/example/status/velvet-data/velvet-data/v1";

/** A configuration and a snapshot, served the way a real installation does. */
function serving(documents: Record<string, unknown>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = documents[url];
    if (body === undefined) return new Response("", { status: 404 });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

function withFetch<T>(implementation: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const reference = { statusPageName: "Example Status", url: PAGE };

const configuration = {
  dataBaseUrl: DATA,
  theme: {
    accent: "#123456",
    grid: {
      operational: "#2ea043",
      degraded: "#d29922",
      outage: "#f85149",
      noData: "#1c1d21",
    },
  },
};

test("describes an installation from its own published files", async () => {
  const installation = await withFetch(
    serving({
      [`${PAGE}config.json`]: configuration,
      [`${DATA}/status.json`]: {
        monitoringStartedAt: "2026-01-05T08:00:00.000Z",
        services: [
          { name: "Website", status: "operational" },
          { name: "API", status: "operational" },
        ],
      },
    }),
    () => describeInstallation(reference),
  );

  assert.ok(installation);
  assert.equal(installation.statusPageName, "Example Status");
  // Without the scheme and the trailing slash, which is what a reader reads.
  assert.equal(installation.host, "example.github.io/status");
  assert.equal(installation.previewUrl, `${PAGE}og.png`);
  assert.equal(installation.services, 2);
  assert.equal(installation.state, "operational");
  // The installation's own colour, not one this page chose for it.
  assert.equal(installation.stateColour, "#2ea043");
  assert.equal(installation.startedAt, "2026-01-05T08:00:00.000Z");
});

test("a page with one service down is not operational", async () => {
  const installation = await withFetch(
    serving({
      [`${PAGE}config.json`]: configuration,
      [`${DATA}/status.json`]: {
        services: [
          { name: "Website", status: "operational" },
          { name: "API", status: "outage" },
        ],
      },
    }),
    () => describeInstallation(reference),
  );

  // The worst wins. A page with an endpoint down is not operational however
  // many others are up.
  assert.equal(installation?.state, "outage");
  assert.equal(installation?.stateColour, "#f85149");
});

test("an installation whose page has gone is left out entirely", async () => {
  // Its repository may still exist and still consent, so the service keeps
  // listing it. A card would then show a name pointing at a page nobody can
  // open, which is worse than showing nothing.
  const installation = await withFetch(serving({}), () =>
    describeInstallation(reference),
  );

  assert.equal(installation, null);
});

test("an installation whose data cannot be read still appears", async () => {
  // The page answers, so it exists and can be opened. Only what it is doing is
  // unknown, and the card says so rather than dropping the entry.
  const installation = await withFetch(
    serving({ [`${PAGE}config.json`]: configuration }),
    () => describeInstallation(reference),
  );

  assert.ok(installation);
  assert.equal(installation.state, "unknown");
  assert.equal(installation.services, 0);
  assert.equal(installation.startedAt, null);
  assert.equal(installation.stateColour, "#1c1d21");
});

test("a theme that names no colours falls back to Velvet's own", async () => {
  const installation = await withFetch(
    serving({
      [`${PAGE}config.json`]: { dataBaseUrl: DATA },
      [`${DATA}/status.json`]: { services: [{ status: "degraded" }] },
    }),
    () => describeInstallation(reference),
  );

  assert.equal(installation?.stateColour, "#d29922");
});

test("names each state in words as well as colour", () => {
  assert.equal(stateLabel("operational"), "All operational");
  assert.equal(stateLabel("degraded"), "Degraded");
  assert.equal(stateLabel("outage"), "Outage");
  assert.equal(stateLabel("unknown"), "No data yet");
});

test("says since when a page has been watched, in units worth reading", () => {
  const now = new Date("2026-08-04T12:00:00.000Z");

  // Set up today: the date alone, since "0 days" says less than nothing.
  assert.equal(
    watchingSince("2026-08-04T09:00:00.000Z", now),
    "Watching since 4 August 2026",
  );
  assert.equal(
    watchingSince("2026-08-03T09:00:00.000Z", now),
    "Watching since 3 August 2026, a day",
  );
  assert.equal(
    watchingSince("2026-07-20T09:00:00.000Z", now),
    "Watching since 20 July 2026, 15 days",
  );
  assert.equal(
    watchingSince("2026-03-18T09:00:00.000Z", now),
    "Watching since 18 March 2026, 4 months",
  );
  // Beyond a year the count of months stops being the useful sentence.
  assert.equal(
    watchingSince("2025-06-01T09:00:00.000Z", now),
    "Watching since 1 June 2025, over a year",
  );
  assert.equal(
    watchingSince("2023-01-15T09:00:00.000Z", now),
    "Watching since 15 January 2023, 3 years",
  );
});

test("an unusable date says nothing rather than something wrong", () => {
  assert.equal(watchingSince(null), null);
  assert.equal(watchingSince("whenever"), null);
});
