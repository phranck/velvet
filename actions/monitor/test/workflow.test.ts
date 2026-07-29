import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "bun:test";

const examples = resolve(import.meta.dirname, "../examples");

type Workflow = {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency: Record<string, unknown>;
  jobs: Record<
    string,
    {
      steps: Array<{
        uses?: string;
        with?: Record<string, unknown>;
      }>;
    }
  >;
};

async function workflow(name: string): Promise<Workflow> {
  return Bun.YAML.parse(
    await readFile(join(examples, name), "utf8"),
  ) as Workflow;
}

function actionStep(document: Workflow): {
  uses?: string;
  with?: Record<string, unknown>;
} {
  const steps = Object.values(document.jobs)[0]?.steps ?? [];
  const step = steps.find(({ uses }) =>
    uses?.startsWith("phranck/velvet/actions/monitor@"),
  );
  assert.ok(step);
  return step;
}

function assertPinnedActions(document: Workflow): void {
  const steps = Object.values(document.jobs).flatMap(({ steps }) => steps);
  for (const step of steps) {
    if (step.uses === undefined) continue;
    assert.match(step.uses, /^[^@\s]+@[0-9a-f]{40}$/u);
  }
}

test("provides a pinned five-minute status workflow", async () => {
  const document = await workflow("velvet-status.yml");

  assert.deepEqual(document.on.schedule, [{ cron: "*/5 * * * *" }]);
  assert.deepEqual(document.on.workflow_dispatch, {});
  assert.deepEqual(document.on.repository_dispatch, {
    types: ["velvet-monitor"],
  });
  assert.equal("pull_request" in document.on, false);
  assert.deepEqual(document.permissions, {
    contents: "write",
    issues: "write",
  });
  assert.deepEqual(document.concurrency, {
    group: "velvet-status-data",
    "cancel-in-progress": false,
  });
  assert.equal(actionStep(document).with?.mode, "status");
  assertPinnedActions(document);
});

test("provides a pinned four-times-daily response workflow", async () => {
  const document = await workflow("velvet-response-times.yml");

  assert.deepEqual(document.on.schedule, [
    { cron: "0 0,6,12,18 * * *" },
  ]);
  assert.deepEqual(document.on.workflow_dispatch, {});
  assert.equal("pull_request" in document.on, false);
  assert.deepEqual(document.permissions, { contents: "write" });
  assert.deepEqual(document.concurrency, {
    group: "velvet-status-data",
    "cancel-in-progress": false,
  });
  assert.equal(actionStep(document).with?.mode, "response");
  assertPinnedActions(document);
});
