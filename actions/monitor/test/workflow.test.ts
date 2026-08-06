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
      if?: string;
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

/**
 * Requires every third-party action to be pinned by commit, and Velvet's own to
 * track its major tag.
 *
 * The two rules differ because the risk differs. A tag on somebody else's action
 * can be moved to code nobody here reviewed, so those are pinned by commit. The
 * `v1` tag on this repository is moved deliberately as part of releasing, and
 * `documentation/releasing.md` requires consumer examples to use it, since nobody regenerates
 * an example a person copied once. A commit written into one goes stale at the
 * next contract change and then fails every run for whoever copied it, which is
 * exactly what issue 149 was.
 *
 * The workflows an installation actually receives are a separate matter: those
 * are pinned by commit so an installation is reproducible, and the setup service
 * asserts that separately.
 */
function assertPinnedActions(document: Workflow): void {
  const steps = Object.values(document.jobs).flatMap(({ steps }) => steps);
  for (const step of steps) {
    if (step.uses === undefined) continue;
    if (step.uses.startsWith("phranck/velvet")) {
      assert.match(
        step.uses,
        /^phranck\/velvet(?:\/[^@\s]+)?@v1$/u,
        "an example tracks Velvet's major tag rather than a commit",
      );
      continue;
    }
    assert.match(
      step.uses,
      /^[^@\s]+@[0-9a-f]{40}$/u,
      "a third-party action is pinned by commit",
    );
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

test("runs a maintenance issue only when its author has write access", async () => {
  // A maintenance window suppresses incident reporting, and a public repository
  // lets anyone open an issue whose template applies the maintenance label. The
  // job must therefore gate an issues event on the author's write access, or a
  // stranger could hide a real outage. Both the copy an installation receives
  // and the copy a person copies by hand carry the same gate.
  const templatePath = resolve(
    import.meta.dirname,
    "../../../template/.github/workflows/velvet-status.yml",
  );
  const sources = {
    example: await workflow("velvet-status.yml"),
    template: Bun.YAML.parse(
      await readFile(templatePath, "utf8"),
    ) as Workflow,
  };

  for (const [name, document] of Object.entries(sources)) {
    const condition = document.jobs.monitor?.if ?? "";
    assert.match(
      condition,
      /author_association/u,
      `${name} must gate an issues event on the author's association`,
    );
    assert.match(
      condition,
      /OWNER"?,\s*"?MEMBER"?,\s*"?COLLABORATOR/u,
      `${name} must trust only write-access associations`,
    );
    // The gate is an addition to the label check, not a replacement, so a
    // legitimate maintenance issue still runs.
    assert.match(condition, /maintenance/u, `${name} keeps the label check`);
  }
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
