import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");

test("status-page action builds exclusively from Velvet v1 data", async () => {
  const source = await readFile(resolve(repositoryRoot, "action.yml"), "utf8");

  assert.match(source, /data:\n[\s\S]*?default: "velvet-data\/v1"/);
  assert.match(source, /VELVET_DATA\/incidents\.json/);
  assert.match(source, /VELVET_DATA\/status\.json/);
  assert.match(
    source,
    /generate-config\.mjs[^\n]+VELVET_DATA/,
  );
  assert.doesNotMatch(source, /history\/summary\.json|api\.github\.com/);
  assert.match(source, /uses: actions\/setup-node@v7/);
});
