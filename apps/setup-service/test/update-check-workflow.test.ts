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
 * The Velvet revision whose actions understand the configuration this release
 * writes. Raise it together with the pins in `phranck/velvet-template`.
 */
const VELVET_ACTION_COMMIT = "4e3cc3a00aa9d72653f3be0b758ada804434a678";

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

test("every Velvet action the release ships is pinned to its own contract", () => {
  // A pin older than the configuration contract makes a new installation fail
  // its first run with an invalid-configuration error, because the action
  // rejects a field onboarding writes as unknown.
  //
  // Every pin in the artefact is scanned rather than a listed few, because a
  // maintained list is exactly what let this through once already: the list
  // named the two recurring monitor workflows and omitted the Pages workflow,
  // which is the only one onboarding dispatches, so the guard stayed green
  // whilst the failing pin sat untouched.
  let checked = 0;
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
      checked += 1;
      assert.equal(
        commit,
        VELVET_ACTION_COMMIT,
        `${path} pins ${action} at ${commit!.slice(0, 8)}, which is not the revision this release was cut against`,
      );
    }
  }
  assert.notEqual(
    checked,
    0,
    "no Velvet pins were recognised at all, so this guard proves nothing",
  );
});
