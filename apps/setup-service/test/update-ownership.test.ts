import assert from "node:assert/strict";
import { test } from "bun:test";

import { MANAGED_TEMPLATE_PATHS } from "@velvet/contracts";

import {
  VELVET_DATA_BRANCH,
  isProtectedBranch,
  protectedChangedPaths,
} from "../src/update-ownership.js";

test("accepts a change set that stays inside the Velvet-owned file set", () => {
  assert.deepEqual(protectedChangedPaths(MANAGED_TEMPLATE_PATHS), []);
  assert.deepEqual(protectedChangedPaths([]), []);
});

test("reports every changed path that belongs to the user", () => {
  assert.deepEqual(
    protectedChangedPaths([
      ".github/workflows/velvet.yml",
      "velvet.yml",
      "README.md",
      "NOTICE",
      "velvet-data/v1/status.json",
      ".velvet/monitor-state.json",
      ".github/workflows/release.yml",
    ]),
    [
      "velvet.yml",
      "README.md",
      "NOTICE",
      "velvet-data/v1/status.json",
      ".velvet/monitor-state.json",
      ".github/workflows/release.yml",
    ],
  );
});

test("does not accept a managed path that only looks Velvet-owned", () => {
  assert.deepEqual(
    protectedChangedPaths([
      "./velvet.lock.json",
      "docs/velvet.lock.json",
      "velvet.lock.json.bak",
    ]),
    ["./velvet.lock.json", "docs/velvet.lock.json", "velvet.lock.json.bak"],
  );
});

test("treats the generated data branch as an impossible update target", () => {
  assert.equal(isProtectedBranch(VELVET_DATA_BRANCH), true);
  assert.equal(isProtectedBranch("main"), false);
  assert.equal(isProtectedBranch("velvet/update/2.1.0"), false);
});
