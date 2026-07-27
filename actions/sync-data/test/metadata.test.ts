import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { JSON_SCHEMA, load } from "js-yaml";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

async function yaml(path: string): Promise<Record<string, any>> {
  return load(await readFile(join(repositoryRoot, path), "utf8"), {
    schema: JSON_SCHEMA,
  }) as Record<string, any>;
}

test("defines the reusable sync-data composite action", async () => {
  const action = await yaml("actions/sync-data/action.yml");

  assert.equal(action.runs.using, "composite");
  assert.equal(action.inputs.output.default, "velvet-data/v1");
  assert.equal(
    action.runs.steps.some((step: Record<string, unknown>) => step.uses === "actions/setup-node@v7"),
    true,
  );
  assert.equal(
    action.runs.steps.some(
      (step: Record<string, unknown>) =>
        typeof step.run === "string" && step.run.includes("scripts/sync.sh"),
    ),
    true,
  );
});

test("reference workflow serializes with Upptime and cannot trigger itself", async () => {
  const workflow = await yaml("actions/sync-data/examples/sync-velvet-data.yml");
  const commitScript = await readFile(
    join(repositoryRoot, "actions/sync-data/scripts/sync.sh"),
    "utf8",
  );

  assert.deepEqual(workflow.permissions, {
    contents: "write",
    issues: "read",
  });
  assert.deepEqual(workflow.concurrency, {
    group: "${{ github.repository }}-${{ github.head_ref || github.ref_name }}-upptime",
    "cancel-in-progress": false,
  });
  assert.deepEqual(workflow.on.push.paths, [".upptimerc.yml", "history/**"]);
  assert.deepEqual(workflow.on.issues.types, [
    "opened",
    "closed",
    "reopened",
    "edited",
    "labeled",
    "unlabeled",
  ]);
  assert.deepEqual(workflow.on.workflow_dispatch, {});
  assert.equal(Array.isArray(workflow.on.schedule), true);
  assert.equal(JSON.stringify(workflow).includes("pages: write"), false);
  assert.equal(JSON.stringify(workflow).includes("velvet-data/**"), false);
  assert.equal(commitScript.includes("[skip ci]"), true);
});
