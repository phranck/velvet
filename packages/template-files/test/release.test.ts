import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "bun:test";

import {
  MANAGED_TEMPLATE_PATHS,
  type VelvetReleaseManifest,
} from "@velvet/contracts";

import { buildReleaseManifest, compatibilityFloor } from "../src/index.js";
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

/**
 * A predecessor declaring a floor of its own, used by the floor tests below.
 *
 * @param overrides - The fields the individual test varies.
 * @returns A manifest standing in for the release being followed.
 */
function predecessor(
  overrides: Partial<VelvetReleaseManifest> = {},
): VelvetReleaseManifest {
  const built = buildReleaseManifest(
    input({
      version: "1.3.1",
      compatibility: {
        minimumInstalledVersion: "1.0.0",
        configurationSchemaVersion: 1,
        dataSchemaVersion: 1,
        configurationMigrationRequired: false,
        dataMigrationRequired: false,
      },
      releaseNotes: "# Velvet 1.3.1\n",
    }),
  );
  assert.equal(built.success, true);
  if (!built.success) throw new Error("the predecessor could not be built");
  return { ...built.data, ...overrides };
}

test("carries the predecessor's floor forward when no schema changes", () => {
  assert.equal(compatibilityFloor(predecessor(), "1.3.2", false), "1.0.0");
});

test("raises the floor to the predecessor when a schema changes", () => {
  assert.equal(compatibilityFloor(predecessor(), "2.0.0", true), "1.3.1");
});

test("a first release declares itself as its own floor", () => {
  assert.equal(compatibilityFloor(undefined, "1.0.0", false), "1.0.0");
});

test("a chain of releases that change nothing keeps the original floor", () => {
  // Each release is cut against the one before it, and none announces a
  // migration, which is what every Velvet release since 1.0.0 has done.
  let floor = compatibilityFloor(undefined, "1.0.0", false);
  for (const version of ["1.1.0", "1.1.1", "1.2.0", "1.3.0", "1.3.1"]) {
    floor = compatibilityFloor(
      predecessor({
        version,
        compatibility: {
          ...predecessor().compatibility,
          minimumInstalledVersion: floor,
        },
      }),
      version,
      false,
    );
  }
  assert.equal(floor, "1.0.0");
});
