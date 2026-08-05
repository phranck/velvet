import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "bun:test";

import { MANAGED_TEMPLATE_PATHS } from "@velvet/contracts";

import { buildReleaseManifest } from "../src/index.js";
import type { BuildReleaseManifestInput } from "../src/index.js";

const templateCommit = "b".repeat(40);
const pagesWorkflow = ".github/workflows/velvet.yml";
const announceWorkflow = ".github/workflows/deploy-announce.yml";

const sourceFiles: Record<string, string> = Object.fromEntries(
  MANAGED_TEMPLATE_PATHS.filter((path) => path !== "velvet.lock.json").map(
    (path) => [path, `source for ${path}\n`],
  ),
);

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function input(
  overrides: Partial<BuildReleaseManifestInput> = {},
): BuildReleaseManifestInput {
  return {
    version: "2.1.0",
    releaseType: "feature",
    automaticInstallEligible: false,
    compatibility: {
      minimumInstalledVersion: "2.0.0",
      configurationSchemaVersion: 1,
      dataSchemaVersion: 1,
      configurationMigrationRequired: false,
      dataMigrationRequired: false,
    },
    releaseNotes: "# Velvet 2.1.0\n",
    source: {
      repository: "phranck/velvet",
      commit: templateCommit,
      files: sourceFiles,
    },
    ...overrides,
  };
}

test("derives the complete managed file set from the template source", () => {
  const result = buildReleaseManifest(input());

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(
    result.data.managedFiles.map((file) => file.path),
    [...MANAGED_TEMPLATE_PATHS],
  );
  assert.deepEqual(
    result.data.managedFiles.find((file) => file.path === "velvet.lock.json"),
    { path: "velvet.lock.json", strategy: "generate", generator: "version-lock-v1" },
  );
  assert.deepEqual(
    result.data.managedFiles.find((file) => file.path === pagesWorkflow),
    {
      path: pagesWorkflow,
      strategy: "generate",
      generator: "pages-workflow-v1",
      sourcePath: pagesWorkflow,
      sha256: sha256(sourceFiles[pagesWorkflow]!),
    },
  );
  assert.deepEqual(
    result.data.managedFiles.find((file) => file.path === announceWorkflow),
    {
      path: announceWorkflow,
      strategy: "replace",
      sourcePath: announceWorkflow,
      sha256: sha256(sourceFiles[announceWorkflow]!),
    },
  );
  assert.equal(result.data.template.commit, templateCommit);
  assert.equal(result.data.schemaVersion, 1);
});

test("refuses to build a manifest when the template source is incomplete", () => {
  const files = { ...sourceFiles };
  delete files[pagesWorkflow];

  const result = buildReleaseManifest(
    input({
      source: {
        repository: "phranck/velvet",
        commit: templateCommit,
        files,
      },
    }),
  );

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errors[0]?.code, "MISSING_TEMPLATE_SOURCE");
  assert.equal(result.errors[0]?.path, pagesWorkflow);
});

test("applies the publication rules to the derived manifest", () => {
  const successor = buildReleaseManifest(input({ version: "2.2.0" }));
  assert.equal(successor.success, true);
  if (!successor.success) return;

  const result = buildReleaseManifest(
    input({ previousManifest: successor.data }),
  );

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errors[0]?.code, "NON_FORWARD_RELEASE");
});

test("rejects an automatic release that is not a migration-free security fix", () => {
  const result = buildReleaseManifest(
    input({ automaticInstallEligible: true }),
  );

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errors[0]?.code, "INVALID_RELEASE_MANIFEST");
});
