import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, test } from "bun:test";

import type {
  DayStatus,
  ResponseTimesDocument,
  Service,
} from "../src/lib/types.js";
import {
  createSvelteRenderer,
  type SvelteRenderer,
} from "./render-svelte.js";
import { resolveTheme } from "../src/lib/theme.js";

let renderer: SvelteRenderer;

beforeAll(async () => {
  renderer = await createSvelteRenderer();
});

afterAll(async () => {
  await renderer.close();
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

async function renderServiceRow(
  service: Service,
  open = true,
  responseSeries: ResponseTimesDocument["series"] = [],
): Promise<string> {
  return renderer.render("/src/components/ServiceRow.svelte", {
    service,
    days,
    uptime: "99.95%",
    rangeLabel: "24h ago",
    range: "day",
    generatedAt: "2026-07-27T12:00:00.000Z",
    responseSeries,
    icon: "ph-globe",
    open,
    onToggle: () => undefined,
    chart: resolveTheme().chart,
  });
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
  assert.equal(html.match(/class="protocol-reading(?:\s|")/g)?.length, 2);
  assert.equal(html.match(/class="protocol-separator(?:\s|")/g)?.length, 1);
  assert.match(html, /class="protocol-separator(?:\s|")[^>]*aria-hidden="true"[^>]*>\|<\/span>/);
  assert.match(html, /--protocol-color:\s*var\(--protocol-ipv4\)/);
  assert.match(html, /--protocol-color:\s*var\(--protocol-ipv6\)/);
  assert.match(html, /--status-color:\s*var\(--grid-degraded\)/);
  assert.match(html, /--status-color:\s*var\(--grid-operational\)/);
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
  assert.doesNotMatch(html, /class="protocol-separator(?:\s|")/);
});

test("centers protocol readings as one horizontal group", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../src/components/service/ServiceDetails.svelte"),
    "utf8",
  );

  assert.match(
    source,
    /\.protocol-grid\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center[^}]*justify-content:\s*center/s,
  );
  assert.doesNotMatch(source, /grid-template-columns:/);
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

test("reuses the response chart inside service details", async () => {
  const service: Service = {
    id: "website",
    name: "Website",
    status: "operational",
    checks: [
      {
        id: "website-ipv4",
        protocol: "ipv4",
        status: "operational",
        checkedAt: "2026-07-27T12:00:00.000Z",
        responseTimeMs: 90,
      },
    ],
    dailyAvailability: [],
  };
  const html = await renderServiceRow(service, true, [
    {
      serviceId: "website",
      checkId: "website-ipv4",
      protocol: "ipv4",
      samples: [
        { timestamp: "2026-07-27T12:00:00.000Z", responseTimeMs: 90 },
      ],
    },
  ]);

  assert.match(html, /<figcaption[^>]*>Response time<\/figcaption>/);
  assert.match(html, /Response time history for Website/);
});

test("smoothly animates service disclosure with a reduced-motion fallback", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../src/components/service/ServiceDetails.svelte"),
    "utf8",
  );

  assert.match(source, /transition:\s*grid-template-rows/);
  assert.match(source, /\.detail-wrap\.open[\s\S]*opacity:\s*1/);
  assert.match(source, /prefers-reduced-motion:\s*reduce/);
});

test("uses one shared theme color for every service icon", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../src/components/service/ServiceSummary.svelte"),
    "utf8",
  );

  assert.match(source, /\.service-icon\s*\{[\s\S]*color:\s*var\(--service-icon\)/);
  assert.doesNotMatch(source, /style:color=\{dotColor\}|statusColor/);
});

test("uses the centered section disclosure icon for service cards", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../src/components/service/ServiceSummary.svelte"),
    "utf8",
  );

  assert.match(source, /ph-caret-circle-down chevron/);
  assert.doesNotMatch(source, /ph-caret-down chevron/);
  assert.match(
    source,
    /\.chevron\s*\{[^}]*width:\s*22px[^}]*height:\s*22px[^}]*display:\s*inline-block[^}]*font-size:\s*22px/s,
  );
  assert.match(
    source,
    /\.chevron\s*\{[^}]*transform 160ms ease-in-out/s,
  );
  assert.match(source, /\.chevron\s*\{[^}]*color:\s*var\(--service-icon\)/s);
  assert.doesNotMatch(source, /\.summary:hover \.chevron/);
});
