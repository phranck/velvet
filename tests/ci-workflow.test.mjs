import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";

const repositoryRoot = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, repositoryRoot), "utf8");
}

function jobSource(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing ${jobName} job`);
  const followingJobs = workflow.slice(start + marker.length);
  const nextJob = followingJobs.search(/^ {2}[a-z][a-z0-9-]*:\n/m);
  return workflow.slice(
    start,
    nextJob === -1 ? workflow.length : start + marker.length + nextJob,
  );
}

test("runs independent repository gates for pull requests and main", async () => {
  const workflow = await read(".github/workflows/ci.yml");
  const lintJob = jobSource(workflow, "lint");
  const typecheckJob = jobSource(workflow, "typecheck");
  const testJob = jobSource(workflow, "test");
  const buildJob = jobSource(workflow, "build");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:[\s\S]*branches:\s*\[main\]/);
  assert.match(workflow, /permissions:[\s\S]*contents:\s*read/);
  assert.doesNotMatch(workflow, /^ {2}quality:/m);

  for (const job of [lintJob, typecheckJob, testJob, buildJob]) {
    assert.match(job, /uses:\s*oven-sh\/setup-bun@v2/);
    assert.match(job, /bun-version-file:\s*package\.json/);
    assert.match(job, /bun install --frozen-lockfile/);
  }

  assert.match(lintJob, /docker:\/\/rhysd\/actionlint:1\.7\.12/);
  assert.match(lintJob, /bun run lint/);
  assert.match(typecheckJob, /bun run typecheck/);
  // No browser on the runner. The tests that drive one are watched whilst they
  // run and belong on a machine with a screen, and fetching Chromium and WebKit
  // on every push took sixteen minutes and thirty-six seconds of an
  // eighteen-minute job against one minute and fifty-two of testing.
  assert.doesNotMatch(testJob, /playwright/);
  assert.match(testJob, /run:\s*bun run test:headless/);
  assert.match(
    testJob,
    /name:\s*Install the roff renderer[\s\S]*install -y --no-install-recommends mandoc[\s\S]*name:\s*Test/,
  );
  assert.match(buildJob, /bun run build/);
  assert.doesNotMatch(workflow, /actions\/setup-node|\bnpm\b|\bnpx\b/);
});

test("keeps the complete local push gate in the root package", async () => {
  const packageDocument = JSON.parse(await read("package.json"));

  assert.equal(
    packageDocument.scripts.check,
    "bun run lint && bun run typecheck && bun run test && bun run build",
  );
  assert.equal(packageDocument.scripts["test:ci"], "bun test tests/ci-workflow.test.mjs");
  // `test` is the whole suite, browsers included, which is what a machine with
  // a screen runs. `test:headless` is the part a runner can carry, and it is
  // what CI runs. Both have to reach the workflow's own check.
  assert.match(packageDocument.scripts.test, /test:headless/);
  assert.match(packageDocument.scripts.test, /test:browser/);
  assert.match(packageDocument.scripts["test:headless"], /test:ci/);
});
