import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  MANAGED_TEMPLATE_PATHS,
  RELEASE_MANIFEST_SCHEMA_VERSION,
  UPDATE_LOCK_SCHEMA_VERSION,
  parseVelvetReleaseManifest,
  parseVelvetVersionLock,
  validateVelvetReleaseManifest,
  validateVelvetVersionLock,
} from "../src/index.js";

const templateCommit = "a".repeat(40);
const contentHash = "b".repeat(64);

const validLock = {
  schemaVersion: 1,
  installedVersion: "2.0.0",
  template: {
    repository: "phranck/velvet-template",
    commit: templateCommit,
  },
  configurationSchemaVersion: 1,
  dataSchemaVersion: 1,
};

const validManifest = {
  schemaVersion: 1,
  version: "2.0.1",
  releaseType: "security",
  automaticInstallEligible: true,
  template: {
    repository: "phranck/velvet-template",
    commit: templateCommit,
  },
  compatibility: {
    minimumInstalledVersion: "2.0.0",
    configurationSchemaVersion: 1,
    dataSchemaVersion: 1,
    configurationMigrationRequired: false,
    dataMigrationRequired: false,
  },
  managedFiles: [
    {
      path: ".github/workflows/deploy-announce.yml",
      strategy: "replace",
      sourcePath: ".github/workflows/deploy-announce.yml",
      sha256: contentHash,
    },
    {
      path: ".github/ISSUE_TEMPLATE/maintenance.yml",
      strategy: "generate",
      generator: "maintenance-issue-template-v1",
      sourcePath: ".github/ISSUE_TEMPLATE/maintenance.yml",
      sha256: contentHash,
    },
    {
      path: "velvet.lock.json",
      strategy: "generate",
      generator: "version-lock-v1",
    },
  ],
  releaseNotes: "# Velvet 2.0.1\n\nSecurity update.",
};

test("exports explicit update contract versions and a closed managed-file set", () => {
  assert.equal(UPDATE_LOCK_SCHEMA_VERSION, 1);
  assert.equal(RELEASE_MANIFEST_SCHEMA_VERSION, 1);
  assert.deepEqual(MANAGED_TEMPLATE_PATHS, [
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/ISSUE_TEMPLATE/maintenance.yml",
    ".github/workflows/deploy-announce.yml",
    ".github/workflows/maintenance-switch.yml",
    ".github/workflows/velvet-response-times.yml",
    ".github/workflows/velvet-status.yml",
    ".github/workflows/velvet.yml",
    "velvet.lock.json",
  ]);
});

test("validates and parses a deterministic installed-version lock", () => {
  assert.deepEqual(validateVelvetVersionLock(validLock), {
    success: true,
    data: validLock,
  });
  assert.deepEqual(parseVelvetVersionLock(`${JSON.stringify(validLock)}\n`), {
    success: true,
    data: validLock,
  });
});

test("rejects unsupported lock versions before structural validation", () => {
  const result = validateVelvetVersionLock({
    ...validLock,
    schemaVersion: 2,
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.deepEqual(result.errors[0], {
    code: "UNSUPPORTED_UPDATE_LOCK_VERSION",
    path: "/schemaVersion",
    message: "Version-lock schemaVersion must be 1.",
  });
});

test("rejects mutable template references in version locks", () => {
  const result = validateVelvetVersionLock({
    ...validLock,
    template: { ...validLock.template, commit: "main" },
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errors[0]?.code, "INVALID_UPDATE_LOCK");
  assert.equal(result.errors[0]?.path, "/template/commit");
});

test("accepts only the official immutable template source", () => {
  for (const validate of [
    () =>
      validateVelvetVersionLock({
        ...validLock,
        template: {
          repository: "attacker/velvet-template",
          commit: templateCommit,
        },
      }),
    () =>
      validateVelvetReleaseManifest({
        ...validManifest,
        template: {
          repository: "attacker/velvet-template",
          commit: templateCommit,
        },
      }),
  ]) {
    const result = validate();
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.equal(result.errors[0]?.code, "UNTRUSTED_TEMPLATE_REPOSITORY");
    assert.equal(result.errors[0]?.path, "/template/repository");
  }
});

test("validates a security release with replace and generated files", () => {
  assert.deepEqual(validateVelvetReleaseManifest(validManifest), {
    success: true,
    data: validManifest,
  });
  assert.deepEqual(
    parseVelvetReleaseManifest(`${JSON.stringify(validManifest)}\n`),
    { success: true, data: validManifest },
  );
});

test("allows only safe security releases to opt into automatic installation", () => {
  for (const manifest of [
    { ...validManifest, releaseType: "feature" },
    {
      ...validManifest,
      compatibility: {
        ...validManifest.compatibility,
        configurationMigrationRequired: true,
      },
    },
    {
      ...validManifest,
      compatibility: {
        ...validManifest.compatibility,
        dataMigrationRequired: true,
      },
    },
  ]) {
    const result = validateVelvetReleaseManifest(manifest);
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.equal(result.errors[0]?.code, "UNSAFE_AUTOMATIC_UPDATE");
    assert.equal(result.errors[0]?.path, "/automaticInstallEligible");
  }
});

test("rejects protected, unknown, and duplicate managed paths", () => {
  for (const managedFiles of [
    [
      {
        path: "velvet.yml",
        strategy: "replace",
        sourcePath: "velvet.yml",
        sha256: contentHash,
      },
    ],
    [
      {
        path: ".github/workflows/custom.yml",
        strategy: "replace",
        sourcePath: ".github/workflows/custom.yml",
        sha256: contentHash,
      },
    ],
    [validManifest.managedFiles[0], validManifest.managedFiles[0]],
  ]) {
    const result = validateVelvetReleaseManifest({
      ...validManifest,
      managedFiles,
    });
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.equal(
      ["DUPLICATE_MANAGED_FILE", "UNMANAGED_TEMPLATE_PATH"].includes(
        result.errors[0]?.code ?? "",
      ),
      true,
    );
  }
});

test("rejects mismatched file sources and deterministic generators", () => {
  for (const file of [
    {
      path: ".github/ISSUE_TEMPLATE/config.yml",
      strategy: "replace",
      sourcePath: ".github/ISSUE_TEMPLATE/other.yml",
      sha256: contentHash,
    },
    {
      path: ".github/ISSUE_TEMPLATE/maintenance.yml",
      strategy: "generate",
      generator: "status-workflow-v1",
      sourcePath: ".github/ISSUE_TEMPLATE/maintenance.yml",
      sha256: contentHash,
    },
  ]) {
    const result = validateVelvetReleaseManifest({
      ...validManifest,
      managedFiles: [file, validManifest.managedFiles[2]],
    });
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.equal(
      ["UNSAFE_GENERATED_FILE", "UNSAFE_REPLACED_FILE"].includes(
        result.errors[0]?.code ?? "",
      ),
      true,
    );
  }
});

test("requires an immutable source and digest for source-based generators", () => {
  const generated = validManifest.managedFiles[1];
  assert.equal(generated?.strategy, "generate");
  if (!generated || generated.strategy !== "generate") return;

  for (const file of [
    {
      path: generated.path,
      strategy: generated.strategy,
      generator: generated.generator,
      sha256: generated.sha256,
    },
    {
      path: generated.path,
      strategy: generated.strategy,
      generator: generated.generator,
      sourcePath: generated.sourcePath,
    },
  ]) {
    const result = validateVelvetReleaseManifest({
      ...validManifest,
      managedFiles: [file, validManifest.managedFiles[2]],
    });
    assert.equal(result.success, false);
    if (result.success) continue;
    assert.equal(result.errors[0]?.code, "INVALID_RELEASE_MANIFEST");
    assert.equal(result.errors[0]?.path.startsWith("/managedFiles/0"), true);
  }
});

test("requires the generated version lock in every release", () => {
  const result = validateVelvetReleaseManifest({
    ...validManifest,
    managedFiles: validManifest.managedFiles.slice(0, 2),
  });

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errors[0]?.code, "MISSING_VERSION_LOCK");
  assert.equal(result.errors[0]?.path, "/managedFiles");
});

test("requires compatible schema boundaries and ordered semantic versions", () => {
  const incompatible = validateVelvetReleaseManifest({
    ...validManifest,
    compatibility: {
      ...validManifest.compatibility,
      minimumInstalledVersion: "2.1.0",
    },
  });
  assert.equal(incompatible.success, false);
  if (!incompatible.success) {
    assert.equal(
      incompatible.errors[0]?.code,
      "INVALID_RELEASE_COMPATIBILITY",
    );
    assert.equal(
      incompatible.errors[0]?.path,
      "/compatibility/minimumInstalledVersion",
    );
  }

  const prerelease = validateVelvetReleaseManifest({
    ...validManifest,
    version: "2.0.0-rc.1",
    compatibility: {
      ...validManifest.compatibility,
      minimumInstalledVersion: "2.0.0",
    },
  });
  assert.equal(prerelease.success, false);
  if (!prerelease.success) {
    assert.equal(
      prerelease.errors[0]?.code,
      "INVALID_RELEASE_COMPATIBILITY",
    );
  }

  const invalidVersion = validateVelvetReleaseManifest({
    ...validManifest,
    version: "v2",
  });
  assert.equal(invalidVersion.success, false);
  if (!invalidVersion.success) {
    assert.equal(invalidVersion.errors[0]?.code, "INVALID_RELEASE_MANIFEST");
    assert.equal(invalidVersion.errors[0]?.path, "/version");
  }
});

test("reports malformed JSON without echoing supplied content", () => {
  const secret = "DO_NOT_ECHO_UPDATE_SECRET";
  for (const result of [
    parseVelvetVersionLock(`{${secret}`),
    parseVelvetReleaseManifest(`{${secret}`),
  ]) {
    assert.equal(result.success, false);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});
