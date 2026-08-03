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
  // The browsers are installed before the tests and their system dependencies
  // separately, because those are apt packages on the runner and the cache that
  // carries the browser builds cannot carry them. The install itself is skipped
  // on a cache hit, which is why the two are not one step any more: the download
  // took sixteen minutes and thirty-six seconds of an eighteen-minute job.
  assert.match(
    testJob,
    /name:\s*Install Playwright browser[\s\S]*bunx playwright install chromium webkit[\s\S]*name:\s*Test/,
  );
  assert.match(testJob, /path:\s*~\/\.cache\/ms-playwright/);
  assert.match(
    testJob,
    /name:\s*Install the browsers' system dependencies[\s\S]*playwright install-deps chromium webkit[\s\S]*name:\s*Test/,
  );
  assert.match(
    testJob,
    /name:\s*Install the roff renderer[\s\S]*install -y --no-install-recommends mandoc[\s\S]*name:\s*Test/,
  );
  assert.match(testJob, /bun run test/);
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
  assert.match(packageDocument.scripts.test, /test:ci/);
});
