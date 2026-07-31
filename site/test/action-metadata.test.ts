import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");

test("status-page action builds exclusively from Velvet v1 data", async () => {
  const source = await readFile(resolve(repositoryRoot, "action.yml"), "utf8");

  assert.match(source, /config:\n[\s\S]*?default: "velvet\.yml"/);
  assert.match(source, /data:\n[\s\S]*?default: "\.velvet-data\/velvet-data\/v1"/);
  assert.match(source, /VELVET_DATA\/status\.json/);
  assert.match(
    source,
    /generate-config\.mjs[^\n]+VELVET_DATA/,
  );
  assert.doesNotMatch(source, /history\/summary\.json|api\.github\.com/);
  assert.doesNotMatch(source, /generate-feed|incidents\.atom/);
  assert.match(source, /uses: oven-sh\/setup-bun@v2/);
  assert.match(source, /bun-version: "1\.3\.14"/);
  assert.match(source, /bun install --cwd "\$VELVET_ROOT" --frozen-lockfile/);
  assert.doesNotMatch(source, /actions\/setup-node|\bnpm\b|\bnpx\b|node_modules\/\.bin\/tsx/);
});

test("status-page action publishes Velvet and third-party license notices", async () => {
  const source = await readFile(resolve(repositoryRoot, "action.yml"), "utf8");

  assert.match(
    source,
    /cp "\$VELVET_ROOT\/LICENSE" "\$VELVET_SITE\/dist\/LICENSE"/,
  );
  assert.match(
    source,
    /cp "\$VELVET_ROOT\/THIRD_PARTY_NOTICES\.md" "\$VELVET_SITE\/dist\/THIRD_PARTY_NOTICES\.md"/,
  );
});
