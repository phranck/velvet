import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  PREVIEW_RESPONSE_TIMES,
  PREVIEW_STATUS,
  previewDocumentsForServices,
} from "../src/configurator/preview.js";
import { barsForRange } from "../src/lib/data.js";
import { responseRangeWindow } from "@velvet/bundle-plugins/response-chart";

function responseSeries(serviceId: string, protocol: "ipv4" | "ipv6") {
  const series = PREVIEW_RESPONSE_TIMES.series.find(
    (entry) => entry.serviceId === serviceId && entry.protocol === protocol,
  );
  assert.ok(series, `${serviceId} ${protocol} preview series is missing`);
  return series;
}

test("fills the 90-day preview range with 82 days of dummy response data", () => {
  const websiteIpv4 = responseSeries("website", "ipv4");
  const backendIpv4 = responseSeries("backend", "ipv4");
  const { start, end } = responseRangeWindow(
    "quarter",
    PREVIEW_RESPONSE_TIMES.generatedAt,
    PREVIEW_STATUS.monitoringStartedAt,
  );

  for (const series of [websiteIpv4, backendIpv4]) {
    assert.equal(series.samples.length, 82);
    assert.ok(
      series.samples.every(({ responseTimeMs }) => responseTimeMs !== null),
    );
    assert.ok(Date.parse(series.samples[0]!.timestamp) >= start);
    assert.equal(Date.parse(series.samples.at(-1)!.timestamp), end);
  }
  assert.equal(
    PREVIEW_RESPONSE_TIMES.series.some(({ protocol }) => protocol === "ipv6"),
    false,
  );
  assert.equal(
    PREVIEW_STATUS.services.some(({ checks }) =>
      checks.some(({ protocol }) => protocol === "ipv6"),
    ),
    false,
  );
});

test("fills 82 days of the 90-day preview availability grid", () => {
  for (const service of PREVIEW_STATUS.services) {
    const bars = barsForRange(
      service,
      "quarter",
      PREVIEW_STATUS.generatedAt,
      PREVIEW_STATUS.monitoringStartedAt,
    );

    assert.equal(service.dailyAvailability.length, 82);
    assert.equal(bars.filter(({ hasData }) => hasData).length, 82);
  }
});

test("maps edited service names, order, and identifiers into the live preview", () => {
  const preview = previewDocumentsForServices([
    { id: "api", name: "API" },
    { id: "website", name: "Public Website" },
    { id: "storage", name: "Storage" },
  ]);

  assert.deepEqual(
    preview.status.services.map(({ id, name }) => ({ id, name })),
    [
      { id: "api", name: "API" },
      { id: "website", name: "Public Website" },
      { id: "storage", name: "Storage" },
    ],
  );
  assert.deepEqual(
    preview.responseTimes.series.map(({ serviceId, checkId }) => ({
      serviceId,
      checkId,
    })),
    [
      { serviceId: "api", checkId: "api-ipv4" },
      { serviceId: "website", checkId: "website-ipv4" },
      { serviceId: "storage", checkId: "storage-ipv4" },
    ],
  );
});
