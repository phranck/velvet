import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, test } from "bun:test";

import type { VelvetConfig, VelvetLayout } from "../src/lib/config.js";
import { resolveTheme } from "../src/lib/theme.js";
import type {
  IncidentsDocument,
  ResponseTimesDocument,
  StatusDocument,
} from "../src/lib/types.js";
import {
  createSvelteRenderer,
  type SvelteRenderer,
} from "./render-svelte.js";

let renderer: SvelteRenderer;

beforeAll(async () => {
  renderer = await createSvelteRenderer();
});

afterAll(async () => {
  await renderer.close();
});

const statusDocument: StatusDocument = {
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
          id: "website-ipv4",
          protocol: "ipv4",
          status: "operational",
          checkedAt: "2026-07-27T12:00:00.000Z",
          responseTimeMs: 108,
        },
        {
          id: "website-ipv6",
          protocol: "ipv6",
          status: "operational",
          checkedAt: "2026-07-27T12:00:00.000Z",
          responseTimeMs: 84,
        },
      ],
      dailyAvailability: [
        {
          date: "2026-07-27",
          monitoredSeconds: 86_400,
          unavailableSeconds: 0,
        },
      ],
    },
  ],
};

const responseTimesDocument: ResponseTimesDocument = {
  schemaVersion: 1,
  generatedAt: statusDocument.generatedAt,
  monitoringStartedAt: statusDocument.monitoringStartedAt,
  series: [
    {
      serviceId: "website",
      checkId: "website-ipv4",
      protocol: "ipv4",
      samples: [
        { timestamp: "2026-07-27T10:00:00.000Z", responseTimeMs: 100 },
        { timestamp: "2026-07-27T11:00:00.000Z", responseTimeMs: 130 },
        { timestamp: "2026-07-27T12:00:00.000Z", responseTimeMs: 108 },
      ],
    },
    {
      serviceId: "website",
      checkId: "website-ipv6",
      protocol: "ipv6",
      samples: [
        { timestamp: "2026-07-27T10:00:00.000Z", responseTimeMs: 70 },
        { timestamp: "2026-07-27T11:00:00.000Z", responseTimeMs: 92 },
        { timestamp: "2026-07-27T12:00:00.000Z", responseTimeMs: 84 },
      ],
    },
  ],
};

const incidentsDocument: IncidentsDocument = {
  schemaVersion: 1,
  generatedAt: statusDocument.generatedAt,
  events: [],
};

async function renderStatusPage(
  layout: VelvetLayout,
  allServicesOpen = true,
  incidents: IncidentsDocument = incidentsDocument,
  renderedStatus: StatusDocument = statusDocument,
  serial?: number,
  showPoweredBy = true,
): Promise<string> {
  const config: VelvetConfig = {
    owner: "example",
    repo: "status",
    url: "https://example.github.io/status/",
    dataBranch: "main",
    dataBaseUrl: "https://example.invalid/velvet-data/v1",
    name: "Velvet Configurator",
    logoHeight: 72,
    showPoweredBy,
    navbar: [
      { title: "Status", href: "/" },
      { title: "History", href: "/history" },
    ],
    layout,
    defaultRange: "month",
    theme: resolveTheme(),
    icons: Object.fromEntries(
      renderedStatus.services.map(({ id }) => [id, "ph-globe"]),
    ),
    ...(serial === undefined ? {} : { serial }),
  };

  return renderer.render("/src/components/StatusPage.svelte", {
    config,
    statusDocument: renderedStatus,
    responseTimesDocument,
    incidentsDocument: incidents,
    range: "month",
    openMap: { website: allServicesOpen },
    updated: "Jul 27, 2026, 12:00 PM",
    onSelectRange: () => undefined,
    onToggleAll: () => undefined,
    onToggleService: () => undefined,
  });
}

test("links the brand to the configured public status URL", async () => {
  const html = await renderStatusPage("grouped");

  assert.match(
    html,
    /class="brand(?:\s|")+[^>]*href="https:\/\/example\.github\.io\/status\/"/,
  );
});

test("renders the complete status page from production components", async () => {
  const html = await renderStatusPage("grouped");

  assert.match(html, /data-layout="grouped"/);
  assert.match(html, /Velvet Configurator/);
  assert.match(html, /All systems operational/);
  assert.equal(html.match(/<section class="card(?:\s|")/g)?.length, 1);
  assert.match(html, /IPv4/);
  assert.match(html, /IPv6/);
  assert.match(html, /<path[^>]+data-protocol="ipv4"[^>]+d="[^"]*C/);
  assert.match(html, /powered by/);
  assert.match(html, /class="powered-label(?:\s|")/);
  assert.match(html, /class="velvet-wordmark(?:\s|")/);
  assert.match(html, /class="navlink(?:\s|")+[^>]*href="\/history"[^>]*>History<\/a>/);
  assert.doesNotMatch(html, /class="navlink(?:\s|")+[^>]*href="\/"[^>]*>Status<\/a>/);
  assert.doesNotMatch(html, /Subscribe/);
});

test("renders the existing cards layout through the same page component", async () => {
  const html = await renderStatusPage("cards");

  assert.match(html, /data-layout="cards"/);
  assert.match(html, /class="range-bar(?:\s|")/);
  assert.equal(html.match(/<section class="card(?:\s|")/g)?.length, 1);
});

test("names no view-transition areas, in either layout", async () => {
  // Capturing the card, its head and every row cost 13 to 18 frames longer
  // than 32ms over eight expand-all cycles on a production build in WebKit,
  // against 2 with nothing captured. Opening one service alone started 40
  // animations across all eight areas, five of which did not change. Removing
  // the blend mode, the group's size animation, or any subset of the names
  // moved none of it, so what costs is the capture itself.
  //
  // The panel animates its own height instead, through src/lib/disclosure.ts.
  const serviceIds = ["backend", "dashboard", "database", "storage", "website"];
  const fiveServices: StatusDocument = {
    ...statusDocument,
    services: serviceIds.map((id) => ({
      ...statusDocument.services[0]!,
      id,
      name: id,
      checks: [{ ...statusDocument.services[0]!.checks[0]!, id }],
    })),
  };

  for (const layout of ["cards", "grouped"] as const) {
    const html = await renderStatusPage(
      layout,
      false,
      incidentsDocument,
      fiveServices,
    );
    assert.doesNotMatch(
      html,
      /view-transition-name/,
      `the ${layout} layout still names a view-transition area`,
    );
  }
});

test("renders completed maintenance in the affected service history", async () => {
  const html = await renderStatusPage("cards", true, {
    schemaVersion: 1,
    generatedAt: statusDocument.generatedAt,
    events: [
      {
        id: "maintenance-13",
        kind: "maintenance",
        state: "completed",
        title: "Website maintenance",
        summary: "Production verification.",
        affectedServiceIds: ["website"],
        startsAt: "2026-07-27T10:00:00.000Z",
        endsAt: "2026-07-27T10:30:00.000Z",
      },
    ],
  });

  // The strip is drawn on a canvas, so the day itself carries no markup and no
  // label. What has to survive that is the information: the window is named in
  // the text beside the drawing, and the drawing says how many days it covers.
  assert.match(html, /Maintenance: Website maintenance/);
  assert.match(html, /aria-label="Availability history:[^"]*under maintenance/);
  assert.doesNotMatch(html, /class="[^"]*card maint/);
});

test("uses the shared rotating chevron to toggle every service card", async () => {
  const expanded = await renderStatusPage("grouped", true);
  const collapsed = await renderStatusPage("grouped", false);
  const page = await readFile(
    resolve(import.meta.dirname, "../src/components/StatusPage.svelte"),
    "utf8",
  );

  assert.match(
    expanded,
    /<i class="[^"]*ph-caret-circle-double-down[^"]*\sexpanded"/,
  );
  assert.match(
    collapsed,
    /<i class="[^"]*ph-caret-circle-double-down[^"]*"/,
  );
  assert.doesNotMatch(
    collapsed,
    /<i class="[^"]*ph-caret-circle-double-down[^"]*\sexpanded"/,
  );
  assert.match(
    page,
    /\.toggle-all i\.expanded\s*\{[^}]*transform:\s*rotate\(180deg\)/s,
  );
  assert.match(
    page,
    /\.toggle-all i\s*\{[^}]*width:\s*22px[^}]*height:\s*22px[^}]*font-size:\s*22px/s,
  );
});

test("uses theme variables for headline gradient and card geometry", async () => {
  const page = await readFile(
    resolve(import.meta.dirname, "../src/components/StatusPage.svelte"),
    "utf8",
  );
  const hero = await readFile(
    resolve(import.meta.dirname, "../src/components/StatusHero.svelte"),
    "utf8",
  );

  assert.match(page, /border-radius:\s*var\(--card-radius\)/);
  assert.match(page, /padding:\s*var\(--card-padding\)/);
  assert.match(page, /max-width:\s*var\(--service-card-max-width\)/);
  assert.match(page, /box-shadow:\s*var\(--card-shadow\)/);
  assert.match(
    page,
    /min-height:\s*var\(--status-page-min-height,\s*100vh\)/,
  );
  assert.match(hero, /var\(--headline-start\)/);
  assert.match(hero, /var\(--headline-end\)/);
});

test("applies the canvas color across the complete service card", async () => {
  const page = await readFile(
    resolve(import.meta.dirname, "../src/components/StatusPage.svelte"),
    "utf8",
  );
  const chart = await readFile(
    resolve(
      import.meta.dirname,
      "../src/components/service/ResponseTimeChart.svelte",
    ),
    "utf8",
  );

  assert.match(
    page,
    /\.card\s*\{[^}]*background:\s*color-mix\(\s*in srgb,\s*var\(--chart-background\) var\(--chart-background-opacity\),\s*var\(--card-background\)\s*\)/s,
  );
  assert.doesNotMatch(
    chart,
    /\.plot-background\s*\{[^}]*--chart-background/s,
  );
});

test("places the Velvet credit directly after the service cards", async () => {
  const page = await readFile(
    resolve(import.meta.dirname, "../src/components/StatusPage.svelte"),
    "utf8",
  );

  assert.match(
    page,
    /\{#if config\.showPoweredBy\}\s*<div class="powered">/,
  );
  assert.match(page, /<span class="powered-label">powered by<\/span>/);
  assert.match(page, /<VelvetWordmark[\s\S]*href="https:\/\/github\.com\/phranck\/velvet"/);
  assert.match(
    page,
    /\.powered\s*\{[^}]*margin:\s*18px auto 0[^}]*flex-direction:\s*column/s,
  );
  assert.doesNotMatch(page, /<footer/);
  assert.doesNotMatch(page, /\.footer\s*\{/);
  assert.doesNotMatch(page, /subscribe-link/);
  assert.doesNotMatch(page, /incidents\.atom/);
});

test("toggles without starting a view transition, and states its timing once", async () => {
  const page = await readFile(
    resolve(import.meta.dirname, "../src/components/StatusPage.svelte"),
    "utf8",
  );

  assert.doesNotMatch(page, /createViewTransitionController/);
  assert.doesNotMatch(page, /transitionState/);
  assert.doesNotMatch(page, /view-transition/);
  assert.match(page, /onclick=\{\(\) => onToggleAll\(!allOpen\)\}/);
  assert.match(page, /onToggle=\{\(\) => onToggleService\(service\.id\)\}/);
  // The expand-all control turns in the same time the panels open in, which is
  // the one place that time is stated.
  assert.match(
    page,
    /\.toggle-all i\s*\{[^}]*transform var\(--velvet-disclosure-duration\) ease-in-out/s,
  );
  assert.doesNotMatch(page, /\.animate\(/);
});

test("stamps the installation serial opposite the version, when there is one", async () => {
  const withSerial = await renderStatusPage(
    "grouped",
    true,
    incidentsDocument,
    statusDocument,
    412,
  );
  assert.match(withSerial, /data-status-serial[^>]*>00412</);

  // Opposite the version rather than under the Velvet mark: both stamp the
  // installation, so both are held to the window's bottom corners and read
  // their inset from the one pair of properties.
  assert.doesNotMatch(withSerial, /class="powered[^"]*"[^]*?data-status-serial/);
  const page = await readFile(
    resolve(import.meta.dirname, "../src/components/StatusPage.svelte"),
    "utf8",
  );
  assert.match(page, /\.stamp\s*\{[^}]*position:\s*fixed/s);
  assert.match(
    page,
    /\.stamp\s*\{[^}]*bottom:\s*var\(--page-stamp-inset-block\)/s,
  );
  assert.match(
    page,
    /\.build\s*\{[^}]*left:\s*var\(--page-stamp-inset-inline\)/s,
  );
  assert.match(
    page,
    /\.serial\s*\{[^}]*right:\s*var\(--page-stamp-inset-inline\)/s,
  );

  // An installation made before serials existed has none, and inventing a
  // placeholder would claim something untrue about it.
  const withoutSerial = await renderStatusPage("grouped");
  assert.doesNotMatch(withoutSerial, /data-status-serial/);
});

test("keeps the serial when the Velvet mark is turned off", async () => {
  // The mark is Velvet's; the serial is this installation's own number, and
  // turning off the one does not withdraw the other.
  const html = await renderStatusPage(
    "grouped",
    true,
    incidentsDocument,
    statusDocument,
    412,
    false,
  );

  assert.doesNotMatch(html, /powered by/);
  assert.match(html, /data-status-serial[^>]*>00412</);
});

test("says an empty page is expected, and stops once a day exists", async () => {
  // A page set up a minute ago reports every service operational and shows "No
  // data" against each of them. Both are true, and together they read as
  // something being broken, which is what this notice exists to answer.
  const withoutHistory: StatusDocument = {
    ...statusDocument,
    services: statusDocument.services.map((service) => ({
      ...service,
      dailyAvailability: [],
    })),
  };

  const fresh = await renderStatusPage("grouped", true, incidentsDocument, withoutHistory);
  assert.match(fresh, /Nothing has gone wrong/u);
  assert.match(fresh, /every 5 minutes/u);

  // One finished day is enough to make the bars mean something, so the notice
  // goes by itself rather than waiting to be cleared.
  const settled = await renderStatusPage("grouped");
  assert.doesNotMatch(settled, /Nothing has gone wrong/u);
});

test("nothing above the cards states a width of its own", async () => {
  // The page carries the configured measure and the cards sit one inset inside
  // it, so an element that names a width ends up wider than they are. Taking
  // the shared inset is the only way to match them, and the geometry itself is
  // measured in status-page-width-browser.test.ts.
  const above = ["FirstRunNotice", "Incidents"];
  const sources = await Promise.all(
    above.map((name) =>
      readFile(
        resolve(import.meta.dirname, `../src/components/${name}.svelte`),
        "utf8",
      ),
    ),
  );

  for (const [index, source] of sources.entries()) {
    assert.doesNotMatch(
      source,
      /max-width:/u,
      `${above[index]} must take the page's width rather than name one`,
    );
    assert.match(
      source,
      /margin:[^;]*var\(--status-content-inset\)/u,
      `${above[index]} must take the inset the cards take`,
    );
  }
});

test("prints the Velvet that built the page", async () => {
  // Taken from the module the release writes, not from the repository: a
  // published page is a static build with nothing to read at runtime, so the
  // version that built it is the version it runs. #423.
  const { VELVET_VERSION } = await import("../src/lib/velvet-version.generated.js");
  const html = await renderStatusPage("grouped", false);

  assert.match(html, /data-velvet-version/);
  assert.match(html, new RegExp(`v${VELVET_VERSION.replace(/\./gu, "\\.")}`));
});
