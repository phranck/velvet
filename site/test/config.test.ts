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
