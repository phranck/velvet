import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW_URL = new URL(
  "../.github/workflows/theme-registry.yml",
  import.meta.url,
);

test("provides a reusable theme validation and Pages publishing workflow", async () => {
  const workflow = await readFile(WORKFLOW_URL, "utf8");

  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /tooling-ref:/);
  assert.match(workflow, /repository:\s*phranck\/velvet/);
  assert.match(workflow, /ref:\s*\$\{\{ inputs\.tooling-ref \}\}/);
  assert.match(workflow, /scripts\/build-theme-registry\.mjs/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
});

test("includes the theme registry checks in the root test command", async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageDocument.scripts["test:theme-registry"],
    "node --test tests/theme-registry-build.test.mjs tests/theme-registry-workflow.test.mjs",
  );
  assert.match(packageDocument.scripts.test, /test:theme-registry/);
});
