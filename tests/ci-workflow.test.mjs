import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";

const repositoryRoot = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), "utf8");
}

test("runs the complete repository gate for pull requests and main", async () => {
  const workflow = await read(".github/workflows/ci.yml");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/);
  assert.match(workflow, /permissions:[\s\S]*contents:\s*read/);
  assert.match(workflow, /uses:\s*oven-sh\/setup-bun@v2/);
  assert.match(workflow, /bun-version-file:\s*package\.json/);
  assert.match(workflow, /bun install --frozen-lockfile/);
  assert.match(workflow, /docker:\/\/rhysd\/actionlint:1\.7\.12/);
  assert.match(workflow, /bun run lint/);
  assert.match(workflow, /bun run typecheck/);
  assert.match(workflow, /bun run test/);
  assert.match(workflow, /bun run build/);
  assert.doesNotMatch(workflow, /actions\/setup-node|\bnpm\b|\bnpx\b/);
});

test("keeps the complete local push gate in the root package", async () => {
  const packageDocument = JSON.parse(await read("package.json"));

  assert.equal(
    packageDocument.scripts.check,
    "bun run lint && bun run typecheck && bun run test && bun run build",
  );
  assert.equal(packageDocument.scripts["test:ci"], "bun test tests/ci-workflow.test.mjs");
  assert.match(packageDocument.scripts.test, /test:ci/);
});
