import assert from "node:assert/strict";
import { test } from "bun:test";

import type { ResponseTimesDocument } from "../src/lib/types.js";

type ResponseSeries = ResponseTimesDocument["series"];
type ResponseSamples = ResponseSeries[number]["samples"];
type RangeKey = "day" | "week" | "month" | "quarter" | "year";

interface ResponseChartModule {
  filterResponseSeries(
    series: ResponseSeries,
    range: RangeKey,
    generatedAt: string,
  ): ResponseSeries;
  downsampleResponseSamples(
    samples: ResponseSamples,
    maxPoints: number,
  ): ResponseSamples;
  monotonePath(points: Array<{ x: number; y: number }>): string;
  availableResponseTimestamps(series: ResponseSeries): string[];
  nearestResponseTimestamp(
    timestamps: string[],
    targetTime: number,
  ): string | null;
  responseValuesAtTimestamp(
    series: ResponseSeries,
    timestamp: string,
  ): Array<{ protocol: "ipv4" | "ipv6"; responseTimeMs: number }>;
}

async function loadResponseChartModule(): Promise<Partial<ResponseChartModule>> {
  return import("../src/lib/response-chart.js").catch(() => ({}));
}

const generatedAt = "2026-07-27T12:00:00.000Z";
const timestamps = [
  "2025-07-27T12:00:00.000Z",
  "2026-04-28T12:00:00.000Z",
  "2026-06-27T12:00:00.000Z",
  "2026-07-20T12:00:00.000Z",
  "2026-07-26T12:00:00.000Z",
  generatedAt,
  "2026-07-27T12:01:00.000Z",
];
const series: ResponseSeries = [
  {
    serviceId: "website",
    checkId: "website-ipv4",
    protocol: "ipv4",
    samples: timestamps.map((timestamp, index) => ({
      timestamp,
      responseTimeMs: 100 + index,
    })),
  },
];

test("filters response samples at every selected range boundary", async () => {
  const chart = await loadResponseChartModule();
  assert.equal(typeof chart.filterResponseSeries, "function");
  if (!chart.filterResponseSeries) return;

  const expectedStarts: Record<RangeKey, string> = {
    day: "2026-07-26T12:00:00.000Z",
    week: "2026-07-20T12:00:00.000Z",
    month: "2026-06-27T12:00:00.000Z",
    quarter: "2026-04-28T12:00:00.000Z",
    year: "2025-07-27T12:00:00.000Z",
  };

  for (const range of Object.keys(expectedStarts) as RangeKey[]) {
    const filtered = chart.filterResponseSeries(series, range, generatedAt);
    assert.equal(filtered[0]?.samples[0]?.timestamp, expectedStarts[range]);
    assert.equal(filtered[0]?.samples.at(-1)?.timestamp, generatedAt);
  }
});

test("downsamples deterministically without losing extrema or unavailable gaps", async () => {
  const chart = await loadResponseChartModule();
  assert.equal(typeof chart.downsampleResponseSamples, "function");
  if (!chart.downsampleResponseSamples) return;

  const values = [120, 110, 90, 50, 100, null, null, 140, 500, 130, 125, 115];
  const samples: ResponseSamples = values.map((responseTimeMs, index) => ({
    timestamp: `2026-07-27T${String(index).padStart(2, "0")}:00:00.000Z`,
    responseTimeMs,
  }));

  const first = chart.downsampleResponseSamples(samples, 7);
  const second = chart.downsampleResponseSamples(samples, 7);

  assert.deepEqual(second, first);
  assert.equal(first.length, 7);
  assert.equal(first[0]?.responseTimeMs, 120);
  assert.equal(first.at(-1)?.responseTimeMs, 115);
  assert.ok(first.some(({ responseTimeMs }) => responseTimeMs === 50));
  assert.ok(first.some(({ responseTimeMs }) => responseTimeMs === 500));
  assert.equal(first.filter(({ responseTimeMs }) => responseTimeMs === null).length, 1);
});

test("creates a monotone cubic path without overshooting local extrema", async () => {
  const chart = await loadResponseChartModule();
  assert.equal(typeof chart.monotonePath, "function");
  if (!chart.monotonePath) return;

  assert.equal(
    chart.monotonePath([
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
    ]),
    "M0.00 10.00 C3.33 6.67 6.67 0.00 10.00 0.00 C13.33 0.00 16.67 6.67 20.00 10.00",
  );
  assert.equal(chart.monotonePath([{ x: 4, y: 8 }]), "M4.00 8.00");
  assert.equal(chart.monotonePath([]), "");
});

test("selects the nearest available timestamp and omits unavailable values", async () => {
  const chart = await loadResponseChartModule();
  assert.equal(typeof chart.availableResponseTimestamps, "function");
  assert.equal(typeof chart.nearestResponseTimestamp, "function");
  assert.equal(typeof chart.responseValuesAtTimestamp, "function");
  if (
    !chart.availableResponseTimestamps ||
    !chart.nearestResponseTimestamp ||
    !chart.responseValuesAtTimestamp
  ) {
    return;
  }

  const hoverSeries: ResponseSeries = [
    {
      serviceId: "website",
      checkId: "website-ipv4",
      protocol: "ipv4",
      samples: [
        { timestamp: "2026-07-27T10:00:00.000Z", responseTimeMs: 100 },
        { timestamp: "2026-07-27T11:00:00.000Z", responseTimeMs: null },
        { timestamp: "2026-07-27T12:00:00.000Z", responseTimeMs: null },
      ],
    },
    {
      serviceId: "website",
      checkId: "website-ipv6",
      protocol: "ipv6",
      samples: [
        { timestamp: "2026-07-27T10:00:00.000Z", responseTimeMs: 80 },
        { timestamp: "2026-07-27T11:00:00.000Z", responseTimeMs: 90 },
        { timestamp: "2026-07-27T12:00:00.000Z", responseTimeMs: null },
      ],
    },
  ];

  const timestamps = chart.availableResponseTimestamps(hoverSeries);
  assert.deepEqual(timestamps, [
    "2026-07-27T10:00:00.000Z",
    "2026-07-27T11:00:00.000Z",
  ]);
  assert.equal(
    chart.nearestResponseTimestamp(
      timestamps,
      Date.parse("2026-07-27T10:40:00.000Z"),
    ),
    "2026-07-27T11:00:00.000Z",
  );
  assert.deepEqual(
    chart.responseValuesAtTimestamp(
      hoverSeries,
      "2026-07-27T11:00:00.000Z",
    ),
    [{ protocol: "ipv6", responseTimeMs: 90 }],
  );
  assert.deepEqual(
    chart.responseValuesAtTimestamp(
      hoverSeries,
      "2026-07-27T12:00:00.000Z",
    ),
    [],
  );
});
