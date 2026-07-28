import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "bun:test";

import type { ResponseTimesDocument } from "../src/lib/types.js";
import { resolveTheme } from "../src/lib/theme.js";
import {
  createSvelteRenderer,
  type SvelteRenderer,
} from "./render-svelte.js";

type ResponseSeries = ResponseTimesDocument["series"];

let renderer: SvelteRenderer;

beforeAll(async () => {
  renderer = await createSvelteRenderer();
});

afterAll(async () => {
  await renderer.close();
});

async function renderChart(
  series: ResponseSeries,
  chart = resolveTheme().chart,
): Promise<string> {
  return renderer
    .render("/src/components/service/ResponseTimeChart.svelte", {
      serviceId: "website",
      serviceName: "Website",
      series,
      range: "day",
      generatedAt: "2026-07-27T12:00:00.000Z",
      chart,
    })
    .catch(() => "");
}

test("renders accessible dual-stack series and breaks paths at unavailable samples", async () => {
  const html = await renderChart([
    {
      serviceId: "website",
      checkId: "website-ipv4",
      protocol: "ipv4",
      samples: [
        { timestamp: "2026-07-27T09:00:00.000Z", responseTimeMs: 100 },
        { timestamp: "2026-07-27T10:00:00.000Z", responseTimeMs: 120 },
        { timestamp: "2026-07-27T11:00:00.000Z", responseTimeMs: null },
        { timestamp: "2026-07-27T12:00:00.000Z", responseTimeMs: 140 },
      ],
    },
    {
      serviceId: "website",
      checkId: "website-ipv6",
      protocol: "ipv6",
      samples: [
        { timestamp: "2026-07-27T09:00:00.000Z", responseTimeMs: 80 },
        { timestamp: "2026-07-27T12:00:00.000Z", responseTimeMs: 110 },
      ],
    },
  ]);

  assert.match(html, /<figure[^>]+class="response-chart/);
  assert.match(
    html,
    /<a[^>]+href="#response-chart-website-summary"[^>]*><svg[^>]+role="img"/,
  );
  assert.match(html, /<title[^>]*>Response time history for Website<\/title>/);
  assert.match(html, /<desc[^>]*>[^<]*Unavailable samples create gaps/);
  assert.match(html, /data-protocol="ipv4"[^>]+data-line-style="solid"/);
  assert.match(html, /data-protocol="ipv6"[^>]+data-line-style="dashed"/);
  assert.equal(html.match(/<path[^>]+data-protocol="ipv4"/g)?.length, 1);
  assert.match(html, /<path[^>]+data-protocol="ipv4"[^>]+d="[^"]*C/);
  assert.equal(html.match(/<circle[^>]+data-protocol="ipv4"/g)?.length, 1);
  assert.equal(html.match(/<path[^>]+data-protocol="ipv6"/g)?.length, 1);
  assert.match(
    html,
    /IPv4: current 140 ms, minimum 100 ms, maximum 140 ms, 1 unavailable sample\./,
  );
  assert.match(
    html,
    /IPv6: current 110 ms, minimum 80 ms, maximum 110 ms, no unavailable samples\./,
  );
});

test("renders independently configured line styles and fading fills", async () => {
  const html = await renderChart(
    [
      {
        serviceId: "website",
        checkId: "website-ipv4",
        protocol: "ipv4",
        samples: [
          { timestamp: "2026-07-27T10:00:00.000Z", responseTimeMs: 100 },
          { timestamp: "2026-07-27T12:00:00.000Z", responseTimeMs: 120 },
        ],
      },
      {
        serviceId: "website",
        checkId: "website-ipv6",
        protocol: "ipv6",
        samples: [
          { timestamp: "2026-07-27T10:00:00.000Z", responseTimeMs: 80 },
          { timestamp: "2026-07-27T12:00:00.000Z", responseTimeMs: 90 },
        ],
      },
    ],
    {
      ipv4LineStyle: "dotted",
      ipv6LineStyle: "solid",
      fill: true,
      background: "#112233",
      backgroundOpacity: 0.4,
    },
  );

  assert.match(html, /data-protocol="ipv4"[^>]+data-line-style="dotted"/);
  assert.match(html, /data-protocol="ipv6"[^>]+data-line-style="solid"/);
  assert.equal(html.match(/class="series-area(?:\s|")/g)?.length, 2);
  assert.match(html, /data-response-hover/);
  assert.match(html, /tabindex="0"/);
});

test("renders a single response sample as an intentional point", async () => {
  const html = await renderChart([
    {
      serviceId: "website",
      checkId: "website-ipv4",
      protocol: "ipv4",
      samples: [
        { timestamp: "2026-07-27T12:00:00.000Z", responseTimeMs: 75 },
      ],
    },
  ]);

  assert.equal(html.match(/<circle[^>]+data-protocol="ipv4"/g)?.length, 1);
  assert.doesNotMatch(html, /<path[^>]+data-protocol="ipv4"/);
  assert.match(
    html,
    /IPv4: current 75 ms, minimum 75 ms, maximum 75 ms, no unavailable samples\./,
  );
});

test("renders an explicit empty state when the selected range has no samples", async () => {
  const html = await renderChart([
    {
      serviceId: "website",
      checkId: "website-ipv4",
      protocol: "ipv4",
      samples: [
        { timestamp: "2026-07-20T12:00:00.000Z", responseTimeMs: 90 },
      ],
    },
  ]);

  assert.match(html, /role="status">No response history for this range\.<\/p>/);
  assert.doesNotMatch(html, /<svg/);
});

test("summarizes the full filtered history before visual downsampling", async () => {
  const end = Date.parse("2026-07-27T12:00:00.000Z");
  const samples = Array.from({ length: 200 }, (_, index) => ({
    timestamp: new Date(end - (199 - index) * 5 * 60 * 1_000).toISOString(),
    responseTimeMs: index >= 75 && index < 125 ? null : 50 + index,
  }));
  const html = await renderChart([
    {
      serviceId: "website",
      checkId: "website-ipv4",
      protocol: "ipv4",
      samples,
    },
  ]);

  assert.match(
    html,
    /IPv4: current 249 ms, minimum 50 ms, maximum 249 ms, 50 unavailable samples\./,
  );
});

test("renders a large contract-valid history without spreading it onto the call stack", async () => {
  const end = Date.parse("2026-07-27T12:00:00.000Z");
  const samples = Array.from({ length: 150_000 }, (_, index) => ({
    timestamp: new Date(end - (149_999 - index)).toISOString(),
    responseTimeMs: index % 1_000,
  }));
  const html = await renderChart([
    {
      serviceId: "website",
      checkId: "website-ipv4",
      protocol: "ipv4",
      samples,
    },
  ]);

  assert.match(
    html,
    /IPv4: current 999 ms, minimum 0 ms, maximum 999 ms, no unavailable samples\./,
  );
});
