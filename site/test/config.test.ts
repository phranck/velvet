import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/lib/config.js";

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
      },
    }),
  );

  assert.equal(config.theme.accent, "#123456");
  assert.equal(config.theme.grid.operational, "#123456");
  assert.equal(config.theme.grid.degraded, "#abcdef");
  assert.equal(config.theme.grid.outage, "#fedcba");
  assert.equal(config.theme.protocol.ipv6, "#38bdf8");
  assert.equal(config.theme.fontMono, "Example Mono");
});
