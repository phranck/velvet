import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  MANAGED_TEMPLATE_PATHS,
  VELVET_UPDATE_CHECK_NAME,
} from "@velvet/contracts";

import { VELVET_RELEASE } from "../src/velvet-release.generated.js";

/**
 * Guards the two agreements the pre-merge check depends on.
 *
 * The workflow runs in an installation's repository and cannot import
 * anything from this repository, so it carries its own copy of the owned-path
 * list and its own copy of the check name. Both would drift silently: a stale
 * path list would let an update through that changes a file Velvet does not
 * own, and a changed name would make every update wait forever instead of
 * failing. Reading the workflow out of the release artefact is what makes the
 * copies checkable from here.
 */

const WORKFLOW_PATH = ".github/workflows/velvet-update-check.yml";

/**
 * Matches a step that uses an action from this repository, whether that is the
 * monitor at `phranck/velvet/actions/monitor` or the site build at the root.
 * The negative lookahead keeps `phranck/velvet-template`, which appears in
 * every workflow's repository guard, out of the results.
 */
const VELVET_PIN =
  /uses:\s*(phranck\/velvet(?![-\w])(?:\/[^@\s]+)?)@([a-f0-9]{40})/gu;

const MENTIONS_VELVET_ACTION = /uses:\s*phranck\/velvet(?![-\w])/u;

const workflow: string | undefined = (
  VELVET_RELEASE.sources as Record<string, string>
)[WORKFLOW_PATH];

test("the release ships the update check as a managed file", () => {
  assert.equal(
    MANAGED_TEMPLATE_PATHS.includes(WORKFLOW_PATH),
    true,
    "an unmanaged check would never reach an installation",
  );
  assert.equal(typeof workflow, "string");
  assert.equal(
    VELVET_RELEASE.manifest.managedFiles.some(
      (file) => file.path === WORKFLOW_PATH && file.strategy === "replace",
    ),
    true,
    "the check is copied verbatim, since nothing in it depends on a configuration",
  );
});

test("the workflow publishes the check name the service waits for", () => {
  assert.match(
    workflow!,
    new RegExp(`^\\s+name: ${VELVET_UPDATE_CHECK_NAME}$`, "mu"),
  );
});

test("the workflow judges only Velvet's own update branches", () => {
  assert.match(workflow!, /if: startsWith\(github\.head_ref, 'velvet\/update\/'\)/u);
});

test("the workflow allows exactly the paths Velvet owns", () => {
  const start = workflow!.indexOf("<<'PATHS'");
  const end = workflow!.indexOf("\n          PATHS\n", start);
  assert.notEqual(start, -1, "the owned-path list is written as a heredoc");
  assert.notEqual(end, -1);

  const listed = workflow!
    .slice(workflow!.indexOf("\n", start) + 1, end)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  assert.deepEqual([...listed].sort(), [...MANAGED_TEMPLATE_PATHS].sort());
});

test("every Velvet action the release ships names one revision", () => {
  // An installation receives several workflows and each pins the Velvet it uses
  // independently. When they disagree, the run that fails is whichever pin is
  // behind the configuration contract, and the Pages workflow is the only one
  // onboarding dispatches, so a disagreement there fails the very first run.
  //
  // Every pin in the artefact is scanned rather than a listed few, since a
  // maintained list covers the workflows whoever wrote it thought of.
  //
  // Which revision they name is not decided here. That is a question about the
  // world outside this repository, and `scripts/check-template-drift.ts`
  // answers it by building the pinned revision's contracts and validating a
  // configuration against them. A copy of the answer kept here would go stale
  // without anything reporting it.
  const found = new Map<string, string[]>();
  for (const [path, source] of Object.entries(
    VELVET_RELEASE.sources as Record<string, string>,
  )) {
    const pins = [...source.matchAll(VELVET_PIN)];
    if (MENTIONS_VELVET_ACTION.test(source)) {
      assert.notEqual(
        pins.length,
        0,
        `${path} uses a Velvet action without pinning it to a commit`,
      );
    }
    for (const [, action, commit] of pins) {
      found.set(commit!, [...(found.get(commit!) ?? []), `${path} (${action})`]);
    }
  }

  assert.notEqual(
    found.size,
    0,
    "no Velvet pins were recognised at all, so this guard proves nothing",
  );
  assert.equal(
    found.size,
    1,
    `the release pins more than one Velvet revision: ${[...found]
      .map(([commit, where]) => `${commit.slice(0, 8)} in ${where.join(", ")}`)
      .join("; ")}`,
  );
});
