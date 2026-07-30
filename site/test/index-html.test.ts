import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

test("keeps SEO fallbacks without exposing build instructions", async () => {
  const html = await readFile(
    resolve(import.meta.dirname, "../index.html"),
    "utf8",
  );

  assert.match(html, /<title>Status<\/title>/);
  assert.match(html, /<meta name="description" content="Live service status\." \/>/);
  assert.doesNotMatch(html, /Title, description, canonical/);
  assert.doesNotMatch(html, /generate-seo\.ts/);
});
