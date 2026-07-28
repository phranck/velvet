import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "bun:test";

import { JSON_SCHEMA, load } from "js-yaml";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

interface ActionStep {
  uses?: string;
  with?: Record<string, string>;
  run?: string;
}

interface CompositeActionDocument {
  inputs: {
    output: { default: string };
  };
  runs: {
    using: string;
    steps: ActionStep[];
  };
}

interface ReferenceWorkflowDocument {
  permissions: {
    contents: string;
    issues: string;
  };
  concurrency: {
    group: string;
    "cancel-in-progress": boolean;
  };
  on: {
    push: { paths: string[] };
    issues: { types: string[] };
    workflow_dispatch: Record<string, never>;
    schedule: unknown[];
  };
}

async function yaml<T>(path: string): Promise<T> {
  return load(await readFile(join(repositoryRoot, path), "utf8"), {
    schema: JSON_SCHEMA,
  }) as T;
}

test("defines the reusable sync-data composite action", async () => {
  const action = await yaml<CompositeActionDocument>("actions/sync-data/action.yml");

  assert.equal(action.runs.using, "composite");
  assert.equal(action.inputs.output.default, "velvet-data/v1");
  assert.equal(
    action.runs.steps.some(
      (step) =>
        step.uses === "oven-sh/setup-bun@v2" && step.with?.["bun-version"] === "1.3.14",
    ),
    true,
  );
  assert.equal(JSON.stringify(action).includes("actions/setup-node"), false);
  assert.equal(JSON.stringify(action).includes("npm"), false);
  assert.equal(
    action.runs.steps.some(
      (step) =>
        typeof step.run === "string" && step.run.includes("scripts/sync.sh"),
    ),
    true,
  );
});

test("reference workflow serializes with Upptime and cannot trigger itself", async () => {
  const workflow = await yaml<ReferenceWorkflowDocument>(
    "actions/sync-data/examples/sync-velvet-data.yml",
  );
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
  assert.deepEqual(workflow.on.push.paths, [
    ".upptimerc.yml",
    "history/**",
    ".github/workflows/sync-velvet-data.yml",
    ".github/workflows/velvet.yml",
  ]);
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
