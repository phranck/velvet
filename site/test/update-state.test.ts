import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  MANAGED_UPDATE_REASONS,
  MANAGED_UPDATE_STATES,
  type ManagedUpdateReason,
  type ManagedUpdateState,
} from "@velvet/contracts";

import { describeUpdate, isUpdateRunning } from "../src/lib/update-state.js";

const RUNNING: ManagedUpdateState[] = [
  "waiting_for_checks",
  "waiting_for_publication",
  "restoring",
  "waiting_for_recovery",
];

test("marks every running state so the interface keeps watching", () => {
  for (const state of RUNNING) {
    assert.equal(isUpdateRunning(describeUpdate(state)), true, state);
  }
  for (const state of ["succeeded", "restored", "failed", "skipped"] as const) {
    assert.equal(isUpdateRunning(describeUpdate(state)), false, state);
  }
});

test("lets the reason explain a state that means nothing on its own", () => {
  const skipped = describeUpdate("skipped", "already_installed");
  assert.equal(skipped.tone, "success");
  assert.match(skipped.title, /up to date/i);

  const failed = describeUpdate("failed", "checks_failed");
  assert.equal(failed.tone, "warning");
  assert.equal(failed.canRetry, true);
  assert.match(failed.detail, /still running the previous version/i);
});

test("reassures the reader whenever their page was left untouched", () => {
  for (const reason of [
    "checks_failed",
    "merge_rejected",
    "update_closed",
    "protected_files_changed",
  ] as const) {
    const outcome = describeUpdate("failed", reason);
    assert.match(
      outcome.detail,
      /nothing was changed|untouched|nothing was lost|previous version/i,
      `${reason} must say the page is safe`,
    );
  }
});

test("does not offer a retry that cannot succeed", () => {
  for (const reason of [
    "incompatible_release",
    "migration_required",
    "protected_branch_target",
    "protected_files_changed",
    "data_branch_changed",
  ] as const) {
    assert.equal(describeUpdate("failed", reason).canRetry, false, reason);
  }
});

test("never shows a raw identifier for an unrecognized outcome", () => {
  const outcome = describeUpdate(
    "failed",
    "something_new" as ManagedUpdateReason,
  );

  assert.equal(outcome.tone, "warning");
  assert.equal(outcome.detail.includes("_"), false);
  assert.equal(outcome.title.includes("_"), false);
  assert.match(outcome.detail, /nothing was changed/i);
});

test("has wording for every reason and state the service can report", () => {
  // Driven by the shared contract rather than a copy, so a reason added to the
  // service fails this test until the interface has words for it.
  for (const reason of MANAGED_UPDATE_REASONS) {
    const outcome = describeUpdate("failed", reason);
    assert.notEqual(
      outcome.title,
      "The update could not be completed",
      `${reason} has no wording of its own`,
    );
    assert.equal(outcome.detail.length > 0, true, reason);
  }

  for (const state of MANAGED_UPDATE_STATES) {
    const outcome = describeUpdate(state);
    assert.equal(outcome.title.length > 0, true, state);
    assert.equal(outcome.title.includes("_"), false, state);
  }
});
