import assert from "node:assert/strict";
import test from "node:test";

import { applyTheme, loadConfig } from "../src/lib/config.js";

test("defaults Velvet data to the mandatory GitHub repository layout", async () => {
  const config = await loadConfig(async () =>
    Response.json({
      owner: "example",
      repo: "status",
      dataBranch: "main",
    }),
  );

  assert.equal(
    config.dataBaseUrl,
    "https://raw.githubusercontent.com/example/status/main/velvet-data/v1",
  );
});

test("normalises legacy runtime theme fields into the semantic theme", async () => {
  const config = await loadConfig(async () =>
    Response.json({
      owner: "example",
      repo: "status",
      theme: {
        accent: "#123456",
        accentDeg: "#abcdef",
        accentDown: "#fedcba",
        fontMono: "Example Mono",
        chart: {
          ipv4LineStyle: "dotted",
          ipv6LineStyle: "solid",
          fill: true,
        },
      },
    }),
  );

  assert.equal(config.theme.accent, "#123456");
  assert.equal(config.theme.grid.operational, "#123456");
  assert.equal(config.theme.grid.degraded, "#abcdef");
  assert.equal(config.theme.grid.outage, "#fedcba");
  assert.equal(config.theme.protocol.ipv6, "#38bdf8");
  assert.deepEqual(config.theme.chart, {
    ipv4LineStyle: "dotted",
    ipv6LineStyle: "solid",
    fill: true,
  });
  assert.equal(config.theme.fontMono, "Example Mono");
});

test("applies a theme to an isolated preview target", async () => {
  const config = await loadConfig(async () =>
    Response.json({
      owner: "example",
      repo: "status",
      theme: { protocol: { ipv6: "#00aaff" } },
    }),
  );
  const properties = new Map<string, string>();
  const target = {
    style: {
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
    },
  } as HTMLElement;

  applyTheme(config, target);

  assert.equal(properties.get("--protocol-ipv6"), "#00aaff");
  assert.equal(properties.get("--background-start"), "#0e0f13");
  assert.equal(properties.get("--card-radius"), "14px");
  assert.equal(properties.get("--card-padding"), "16px");
  assert.equal(properties.get("--headline-start"), "#e8eaed");
  assert.equal(properties.get("--logo-height"), "72px");
});

test("drops the obsolete Subscribe setting from runtime configuration", async () => {
  const config = await loadConfig(async () =>
    Response.json({
      owner: "example",
      repo: "status",
      showSubscribe: true,
    }),
  );

  assert.equal("showSubscribe" in config, false);
});
