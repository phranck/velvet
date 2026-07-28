import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";

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

before(async () => {
  renderer = await createSvelteRenderer();
});

after(async () => {
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
): Promise<string> {
  const config: VelvetConfig = {
    owner: "example",
    repo: "status",
    url: "https://example.github.io/status/",
    dataBranch: "main",
    dataBaseUrl: "https://example.invalid/velvet-data/v1",
    name: "Velvet Configurator",
    logoHeight: 72,
    showPoweredBy: true,
    navbar: [
      { title: "Status", href: "/" },
      { title: "History", href: "/history" },
    ],
    layout,
    defaultRange: "month",
    theme: resolveTheme(),
    icons: { website: "ph-globe" },
  };

  return renderer.render("/src/components/StatusPage.svelte", {
    config,
    statusDocument,
    responseTimesDocument,
    incidentsDocument,
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

test("uses the shared disclosure transition without page-level FLIP animation", async () => {
  const app = await readFile(
    resolve(import.meta.dirname, "../src/App.svelte"),
    "utf8",
  );

  assert.doesNotMatch(app, /flipToggle/);
  assert.doesNotMatch(app, /\.animate\(/);
  assert.doesNotMatch(app, /getAnimations\(/);
});
