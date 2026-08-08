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
    maintenance: [],
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

test("opens a service through the shared disclosure, and captures nothing", async () => {
  // Two things are held here, and both are measurements rather than taste.
  //
  // The panel is opened by one action that animates one element's height, and
  // the browser's animation timeline plays it, so no script runs per frame. On
  // a production build in WebKit, eight expand-all cycles over six services
  // produce two frames longer than 32ms out of roughly 250. That is what the
  // same page produces with no animation at all.
  //
  // Nothing here may name a view-transition area. Capturing the card, its head
  // and every row produced 40 animations for a single service, and 13 to 18
  // long frames over the same run. Turning off the blend mode, the group's size
  // animation, or any subset of the names changed none of it: the cost is the
  // capture, not what is animated.
  const details = await readFile(
    resolve(import.meta.dirname, "../src/components/service/ServiceDetails.svelte"),
    "utf8",
  );
  const row = await readFile(
    resolve(import.meta.dirname, "../src/components/ServiceRow.svelte"),
    "utf8",
  );
  const page = await readFile(
    resolve(import.meta.dirname, "../src/components/StatusPage.svelte"),
    "utf8",
  );

  assert.match(details, /use:disclosure=\{open\}/);
  // `hidden` must never follow `open`. A closing panel has to stay in the
  // layout until its animation has finished, and the action is the only thing
  // that knows when that is; an attribute tracking `open` would take the panel
  // out of the layout on the first frame instead.
  //
  // The prerendered document still needs both attributes set once, because it
  // carries no script and would otherwise stand open. That is what
  // `startsClosed` is, and reading it untracked is what keeps it from becoming
  // the binding this forbids.
  assert.doesNotMatch(details, /hidden=\{!open\}/);
  assert.match(details, /const startsClosed = untrack\(\(\) => !open\)/);
  assert.match(details, /hidden=\{startsClosed\}/);
  assert.match(details, /inert=\{startsClosed\}/);
  assert.doesNotMatch(details, /\.animate\(/);
  assert.doesNotMatch(details, /grid-template-rows/);

  for (const [name, source] of [
    ["ServiceDetails.svelte", details],
    ["ServiceRow.svelte", row],
    ["StatusPage.svelte", page],
  ] as const) {
    assert.doesNotMatch(source, /view-transition/, `${name} names a view-transition area`);
    assert.doesNotMatch(source, /startViewTransition/, `${name} starts a view transition`);
  }
});

test("the disclosure animates one height and reads its duration from a token", async () => {
  const source = await readFile(
    resolve(import.meta.dirname, "../src/lib/disclosure.ts"),
    "utf8",
  );

  // Height rather than anything the compositor owns, because the panel has to
  // take up space for the rows below it to move at all. It is the only element
  // whose size changes, so everything under it follows by ordinary layout.
  assert.match(source, /node\.animate\(/);
  assert.match(source, /height:\s*`\$\{current\}px`/);
  assert.match(source, /--velvet-disclosure-duration/);
  // The panel leaves the layout only once a collapse has finished, since an
  // element already removed from it cannot be animated out of it.
  assert.match(source, /node\.hidden = !next;/);
  assert.match(source, /node\.inert = !next;/);
  assert.match(source, /prefersReducedMotion/);
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
  // The same token the panel below it opens in, so the two turn together.
  assert.match(
    source,
    /\.chevron\s*\{[^}]*transform var\(--velvet-disclosure-duration\) ease-in-out/s,
  );
  assert.match(source, /\.chevron\s*\{[^}]*color:\s*var\(--service-icon\)/s);
  assert.doesNotMatch(source, /\.summary:hover \.chevron/);
});
