import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "bun:test";

const actionRoot = resolve(import.meta.dirname, "..");

test("defines the Bun monitor action with one required run mode", async () => {
  const action = Bun.YAML.parse(
    await readFile(join(actionRoot, "action.yml"), "utf8"),
  ) as {
    inputs: Record<string, { required?: boolean }>;
    runs: {
      using: string;
      steps: Array<{
        uses?: string;
        run?: string;
        env?: Record<string, string>;
      }>;
    };
  };

  assert.deepEqual(Object.keys(action.inputs), ["mode"]);
  assert.equal(action.inputs.mode?.required, true);
  assert.equal(action.runs.using, "composite");
  assert.equal(
    action.runs.steps[0]?.uses,
    "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
  );
  assert.equal(
    action.runs.steps.some(({ run }) =>
      run?.includes('bun "$GITHUB_ACTION_PATH/src/cli.ts"'),
    ),
    true,
  );
  assert.equal(
    action.runs.steps.some(
      ({ env }) => env?.VELVET_MODE === "${{ inputs.mode }}",
    ),
    true,
  );
});

test("registers the monitor action as a private Bun workspace", async () => {
  const packageDocument = JSON.parse(
    await readFile(join(actionRoot, "package.json"), "utf8"),
  ) as {
    name: string;
    private: boolean;
    scripts: Record<string, string>;
  };

  assert.equal(packageDocument.name, "@velvet/monitor-action");
  assert.equal(packageDocument.private, true);
  assert.deepEqual(Object.keys(packageDocument.scripts).sort(), [
    "build",
    "pretest",
    "test",
    "typecheck",
  ]);
});
