import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

test("keeps the title a page falls back to, without build instructions", async () => {
  const html = await readFile(
    resolve(import.meta.dirname, "../status-theme.html"),
    "utf8",
  );

  assert.match(html, /<title>Status<\/title>/);
  assert.doesNotMatch(html, /Title, description, canonical/);
  assert.doesNotMatch(html, /generate-seo\.ts/);
});
