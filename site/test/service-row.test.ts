import assert from "node:assert/strict";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { render } from "svelte/server";
import { createServer, type ViteDevServer } from "vite";

import type { DayStatus, Service } from "../src/lib/types.js";

const siteRoot = resolve(import.meta.dirname, "..");
let server: ViteDevServer;

before(async () => {
  server = await createServer({
    root: siteRoot,
    configFile: false,
    logLevel: "silent",
    appType: "custom",
    plugins: [svelte({ compilerOptions: { dev: false } })],
    server: { middlewareMode: true },
  });
});

after(async () => {
  await server.close();
});

const days: DayStatus[] = [
  {
    date: "2026-07-27",
    status: "operational",
    minutesDown: 0,
    hasData: true,
    spanDays: 1,
  },
];

async function renderServiceRow(service: Service, open = true): Promise<string> {
  const { default: ServiceRow } = await server.ssrLoadModule(
    "/src/components/ServiceRow.svelte",
  );
  return render(ServiceRow, {
    props: {
      service,
      days,
      uptime: "99.95%",
      rangeLabel: "24h ago",
      range: "day",
      icon: "ph-globe",
      open,
      onToggle: () => undefined,
    },
  }).body;
}

test("renders dual-stack protocol status and latency side by side", async () => {
  const html = await renderServiceRow({
    id: "website",
    name: "Website",
    status: "degraded",
    checks: [
      {
        id: "website-ipv4",
        protocol: "ipv4",
        status: "degraded",
        checkedAt: "2026-07-27T12:00:00.000Z",
        responseTimeMs: 451.4,
      },
      {
        id: "website-ipv6",
        protocol: "ipv6",
        status: "operational",
        checkedAt: "2026-07-27T12:00:00.000Z",
        responseTimeMs: 88,
      },
    ],
    dailyAvailability: [],
  });

  assert.match(html, /class="protocol-grid(?:\s|")/);
  assert.equal(html.match(/class="protocol-status(?:\s|")/g)?.length, 2);
  assert.match(html, /IPv4/);
  assert.match(html, /Degraded/);
  assert.match(html, /451 ms/);
  assert.match(html, /IPv6/);
  assert.match(html, /Operational/);
  assert.match(html, /88 ms/);
  assert.doesNotMatch(html, /href=|https?:\/\//);
});

test("renders one unavailable protocol without an empty counterpart", async () => {
  const html = await renderServiceRow({
    id: "mail",
    name: "Mail",
    status: "unknown",
    checks: [
      {
        id: "mail-ipv6",
        protocol: "ipv6",
        status: "unknown",
        checkedAt: null,
        responseTimeMs: null,
      },
    ],
    dailyAvailability: [],
  });

  assert.equal(html.match(/class="protocol-status(?:\s|")/g)?.length, 1);
  assert.match(html, /IPv6/);
  assert.match(html, /Unavailable/);
  assert.match(html, /No response data/);
  assert.doesNotMatch(html, /IPv4/);
});

test("connects the native toggle button to the expanded protocol details", async () => {
  const html = await renderServiceRow(
    {
      id: "api",
      name: "API",
      status: "outage",
      checks: [
        {
          id: "api-ipv4",
          protocol: "ipv4",
          status: "outage",
          checkedAt: "2026-07-27T12:00:00.000Z",
          responseTimeMs: 900,
        },
      ],
      dailyAvailability: [],
    },
    false,
  );

  assert.match(html, /<button[^>]+aria-expanded="false"/);
  assert.match(html, /aria-controls="service-api-details"/);
  assert.match(html, /id="service-api-details"/);
  assert.match(html, /Down/);
});
