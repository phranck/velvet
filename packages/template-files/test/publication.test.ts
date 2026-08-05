import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "bun:test";

import {
  MANAGED_TEMPLATE_PATHS,
  type VelvetManagedFile,
  type VelvetReleaseManifest,
} from "@velvet/contracts";

import { validateReleasePublication } from "../src/index.js";

const previousCommit = "a".repeat(40);
const candidateCommit = "b".repeat(40);

const sourceFiles = Object.fromEntries(
  MANAGED_TEMPLATE_PATHS.filter((path) => path !== "velvet.lock.json").map(
    (path) => [path, `source for ${path}\n`],
  ),
);

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function managedFiles(): VelvetManagedFile[] {
  return MANAGED_TEMPLATE_PATHS.map((path): VelvetManagedFile => {
    if (path === "velvet.lock.json") {
      return {
        path,
        strategy: "generate",
        generator: "version-lock-v1",
      };
    }
    const generators = {
      ".github/ISSUE_TEMPLATE/maintenance.yml":
        "maintenance-issue-template-v1",
      ".github/workflows/maintenance-switch.yml":
        "maintenance-workflow-v1",
      ".github/workflows/velvet-response-times.yml":
        "response-times-workflow-v1",
      ".github/workflows/velvet-status.yml": "status-workflow-v1",
      ".github/workflows/velvet.yml": "pages-workflow-v1",
    } as const;
    const generator = generators[path as keyof typeof generators];
    if (generator) {
      return {
        path,
        strategy: "generate",
        generator,
        sourcePath: path,
        sha256: sha256(sourceFiles[path]!),
      };
    }
    return {
      path,
      strategy: "replace",
      sourcePath: path,
      sha256: sha256(sourceFiles[path]!),
    };
  });
}

function manifest(
  overrides: Partial<VelvetReleaseManifest> = {},
): VelvetReleaseManifest {
  return {
    schemaVersion: 1,
    version: "2.1.0",
    releaseType: "feature",
    automaticInstallEligible: false,
    template: {
      repository: "phranck/velvet",
      commit: candidateCommit,
    },
    compatibility: {
      minimumInstalledVersion: "2.0.0",
      configurationSchemaVersion: 1,
      dataSchemaVersion: 1,
      configurationMigrationRequired: false,
      dataMigrationRequired: false,
    },
    managedFiles: managedFiles(),
    releaseNotes: "# Velvet 2.1.0\n\nNew managed updates.\n",
    ...overrides,
  };
}

const previousManifest = manifest({
  version: "2.0.5",
  releaseType: "fix",
  template: {
    repository: "phranck/velvet",
    commit: previousCommit,
  },
  releaseNotes: "# Velvet 2.0.5\n\nFixes.\n",
});

function validate(
  candidate: VelvetReleaseManifest = manifest(),
  previous: VelvetReleaseManifest | undefined = previousManifest,
) {
  return validateReleasePublication({
    manifest: candidate,
    previousManifest: previous,
    source: {
      repository: "phranck/velvet",
      commit: candidateCommit,
      files: sourceFiles,
    },
  });
}

test("accepts a complete forward release from its exact immutable source", () => {
  const result = validate();

  assert.deepEqual(result, { success: true, data: manifest() });
});

test("rejects a release that omits any managed template file", () => {
  const candidate = manifest({ managedFiles: managedFiles().slice(1) });
  const result = validate(candidate);

  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(result.errors[0], {
    code: "INCOMPLETE_MANAGED_FILE_SET",
    path: "/managedFiles",
    message: "A published release must contain every Velvet-owned template file.",
  });
});

test("rejects sources from a different repository or commit", () => {
  for (const source of [
    {
      repository: "attacker/velvet-template",
      commit: candidateCommit,
      files: sourceFiles,
    },
    {
      repository: "phranck/velvet",
      commit: previousCommit,
      files: sourceFiles,
    },
  ]) {
    const result = validateReleasePublication({
      manifest: manifest(),
      previousManifest,
      source,
    });
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.equal(result.errors[0]?.code, "SOURCE_REVISION_MISMATCH");
    assert.equal(result.errors[0]?.path, "/template");
  }
});

test("rejects missing or changed content at the immutable source", () => {
  const target = ".github/workflows/deploy-announce.yml";
  for (const files of [
    Object.fromEntries(
      Object.entries(sourceFiles).filter(([path]) => path !== target),
    ),
    { ...sourceFiles, [target]: "changed\n" },
  ]) {
    const result = validateReleasePublication({
      manifest: manifest(),
      previousManifest,
      source: {
        repository: "phranck/velvet",
        commit: candidateCommit,
        files,
      },
    });
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.equal(
      [
        "MISSING_TEMPLATE_SOURCE",
        "TEMPLATE_SOURCE_HASH_MISMATCH",
      ].includes(result.errors[0]?.code ?? ""),
      true,
    );
    assert.equal(result.errors[0]?.path, target);
  }
});

test("requires a strictly newer release compatible with its predecessor", () => {
  for (const candidate of [
    manifest({ version: "2.0.5", releaseType: "fix" }),
    manifest({
      compatibility: {
        ...manifest().compatibility,
        minimumInstalledVersion: "2.0.6",
      },
    }),
  ]) {
    const result = validate(candidate);
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.equal(
      ["NON_FORWARD_RELEASE", "INCOMPATIBLE_PREVIOUS_RELEASE"].includes(
        result.errors[0]?.code ?? "",
      ),
      true,
    );
  }
});

test("requires schema changes and migration flags to agree", () => {
  for (const candidate of [
    manifest({
      compatibility: {
        ...manifest().compatibility,
        configurationSchemaVersion: 2,
      },
    }),
    manifest({
      compatibility: {
        ...manifest().compatibility,
        dataMigrationRequired: true,
      },
    }),
  ]) {
    const result = validate(candidate);
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.equal(result.errors[0]?.code, "INCONSISTENT_SCHEMA_MIGRATION");
    assert.equal(result.errors[0]?.path.startsWith("/compatibility/"), true);
  }
});

test("rejects feature-sized releases classified as fixes and patch releases classified as features", () => {
  for (const candidate of [
    manifest({ releaseType: "fix" }),
    manifest({ version: "2.0.6", releaseType: "feature" }),
  ]) {
    const result = validate(candidate);
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.deepEqual(result.errors[0], {
      code: "INCORRECT_RELEASE_CLASSIFICATION",
      path: "/releaseType",
      message:
        "Feature releases must change the major or minor version; fix and security releases must change only the patch version.",
    });
  }
});

test("accepts a patch security release and an explicitly migrated feature release", () => {
  const security = validate(
    manifest({
      version: "2.0.6",
      releaseType: "security",
      automaticInstallEligible: true,
    }),
  );
  assert.equal(security.success, true);

  const migration = validate(
    manifest({
      compatibility: {
        ...manifest().compatibility,
        configurationSchemaVersion: 2,
        configurationMigrationRequired: true,
      },
    }),
  );
  assert.equal(migration.success, true);
});

test("validates a first publication without inventing a predecessor", () => {
  const result = validate(manifest(), undefined);

  assert.equal(result.success, true);
});
