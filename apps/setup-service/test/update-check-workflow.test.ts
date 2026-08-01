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
 * The Velvet revision whose monitor understands the configuration this release
 * writes. Raise it together with the pin in `phranck/velvet-template`.
 */
const VELVET_MONITOR_COMMIT = "4e3cc3a00aa9d72653f3be0b758ada804434a678";

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

test("the monitor the release ships is the one that understands its contract", () => {
  // A pin older than the configuration contract makes a new installation fail
  // its first run with an invalid-configuration error, because the monitor
  // rejects a field onboarding writes. Asserting the pin here is what stops
  // the two drifting apart again.
  const workflows = [
    ".github/workflows/velvet-status.yml",
    ".github/workflows/velvet-response-times.yml",
  ];
  for (const path of workflows) {
    const source = (VELVET_RELEASE.sources as Record<string, string>)[path];
    assert.equal(typeof source, "string", path);
    const pin = source!.match(
      /phranck\/velvet\/actions\/monitor@([a-f0-9]{40})/u,
    );
    assert.notEqual(pin, null, `${path} pins the monitor by commit`);
    assert.equal(
      pin![1],
      VELVET_MONITOR_COMMIT,
      `${path} must pin the monitor this release was cut against`,
    );
  }
});
