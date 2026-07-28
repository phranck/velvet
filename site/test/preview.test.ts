import assert from "node:assert/strict";
import test from "node:test";

import {
  PREVIEW_RESPONSE_TIMES,
  PREVIEW_STATUS,
} from "../src/configurator/preview.js";
import { barsForRange } from "../src/lib/data.js";
import { responseRangeWindow } from "../src/lib/response-chart.js";

function responseSeries(serviceId: string, protocol: "ipv4" | "ipv6") {
  const series = PREVIEW_RESPONSE_TIMES.series.find(
    (entry) => entry.serviceId === serviceId && entry.protocol === protocol,
  );
  assert.ok(series, `${serviceId} ${protocol} preview series is missing`);
  return series;
}

test("fills the 90-day preview range with 82 days of dummy response data", () => {
  const websiteIpv4 = responseSeries("website", "ipv4");
  const websiteIpv6 = responseSeries("website", "ipv6");
  const backendIpv4 = responseSeries("backend", "ipv4");
  const backendIpv6 = responseSeries("backend", "ipv6");
  const { start, end } = responseRangeWindow(
    "quarter",
    PREVIEW_RESPONSE_TIMES.generatedAt,
  );

  for (const series of [websiteIpv4, websiteIpv6, backendIpv4, backendIpv6]) {
    assert.equal(series.samples.length, 82);
    assert.ok(
      series.samples.every(({ responseTimeMs }) => responseTimeMs !== null),
    );
    assert.ok(Date.parse(series.samples[0]!.timestamp) >= start);
    assert.equal(Date.parse(series.samples.at(-1)!.timestamp), end);
  }
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
