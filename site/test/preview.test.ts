import assert from "node:assert/strict";
import test from "node:test";

import { PREVIEW_RESPONSE_TIMES } from "../src/configurator/preview.js";

function responseSeries(serviceId: string, protocol: "ipv4" | "ipv6") {
  const series = PREVIEW_RESPONSE_TIMES.series.find(
    (entry) => entry.serviceId === serviceId && entry.protocol === protocol,
  );
  assert.ok(series, `${serviceId} ${protocol} preview series is missing`);
  return series;
}

test("swaps the Website and Backend response graphs in the preview", () => {
  const websiteIpv4 = responseSeries("website", "ipv4");
  const websiteIpv6 = responseSeries("website", "ipv6");
  const backendIpv4 = responseSeries("backend", "ipv4");
  const backendIpv6 = responseSeries("backend", "ipv6");

  assert.equal(websiteIpv4.samples.length, 10);
  assert.equal(websiteIpv4.samples.at(0)?.responseTimeMs, 74);
  assert.equal(websiteIpv4.samples.at(-1)?.responseTimeMs, 82);
  assert.equal(websiteIpv6.samples.at(0)?.responseTimeMs, 108);
  assert.equal(websiteIpv6.samples.at(-1)?.responseTimeMs, 121);

  assert.equal(backendIpv4.samples.length, 19);
  assert.equal(backendIpv4.samples.at(0)?.responseTimeMs, 112);
  assert.equal(backendIpv4.samples.at(-1)?.responseTimeMs, 108);
  assert.equal(backendIpv6.samples.at(0)?.responseTimeMs, 146);
  assert.equal(backendIpv6.samples.at(-1)?.responseTimeMs, 184);
});
