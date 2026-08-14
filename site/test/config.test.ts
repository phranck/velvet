import assert from "node:assert/strict";
import { test } from "bun:test";

import { loadConfig } from "../src/lib/config.js";

test("defaults Velvet data to the mandatory GitHub repository layout", async () => {
  const config = await loadConfig(async () =>
    Response.json({
      owner: "example",
      repo: "status",
      theme: "velvet",
      dataBranch: "main",
    }),
  );

  assert.equal(
    config.dataBaseUrl,
    "https://raw.githubusercontent.com/example/status/main/velvet-data/v1",
  );
});

test("refuses a configuration that names no theme", async () => {
  await assert.rejects(
    loadConfig(async () => Response.json({ owner: "example", repo: "status" })),
    /must name the theme/,
  );
});

test("carries the theme the page is published in", async () => {
  const config = await loadConfig(async () =>
    Response.json({ owner: "example", repo: "status", theme: "retro-chassis" }),
  );

  assert.equal(config.theme, "retro-chassis");
});
