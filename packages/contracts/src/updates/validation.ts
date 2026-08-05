import { Value } from "@sinclair/typebox/value";

import {
  RELEASE_MANIFEST_SCHEMA_VERSION,
  UPDATE_LOCK_SCHEMA_VERSION,
  VelvetReleaseManifestSchema,
  VelvetVersionLockSchema,
  type VelvetReleaseManifest,
  type VelvetTemplateGenerator,
  type VelvetVersionLock,
} from "./schemas.js";
import type {
  ReleaseManifestValidationResult,
  UpdateValidationError,
  UpdateValidationErrorCode,
  UpdateValidationResult,
  VersionLockValidationResult,
} from "./types.js";

type UnknownRecord = Record<string, unknown>;

/**
 * Where the files an installation receives are published from.
 *
 * Velvet's own repository, because that is where they are written and
 * reviewed. They used to live in a repository of their own, which meant two
 * places stated what an installation gets and nothing made them agree.
 */
export const VELVET_TEMPLATE_REPOSITORY = "phranck/velvet" as const;

/**
 * Files a new installation is given once and then owns.
 *
 * Written when the repository is created and never touched again, which is
 * what separates them from {@link MANAGED_TEMPLATE_PATHS}. A README somebody
 * rewrote, or a licence they changed, is theirs; an update that replaced
 * either would be taking back something Velvet gave them.
 */
export const INITIAL_TEMPLATE_PATHS = [
  ".gitattributes",
  "NOTICE",
  "README.md",
] as const;

export type InitialTemplatePath = (typeof INITIAL_TEMPLATE_PATHS)[number];

export const MANAGED_TEMPLATE_PATHS = [
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/maintenance.yml",
  ".github/workflows/deploy-announce.yml",
  ".github/workflows/maintenance-switch.yml",
  ".github/workflows/velvet-response-times.yml",
  ".github/workflows/velvet-status.yml",
  ".github/workflows/velvet-update-check.yml",
  ".github/workflows/velvet.yml",
  "velvet.lock.json",
] as const;

export type ManagedTemplatePath = (typeof MANAGED_TEMPLATE_PATHS)[number];

const MANAGED_TEMPLATE_PATH_SET = new Set<string>(MANAGED_TEMPLATE_PATHS);

/**
 * Deterministic generator that owns each configuration-dependent managed file.
 *
 * A path absent from this map is copied verbatim from the immutable template
 * revision. Release publication and release validation share this single
 * mapping so that a generated file can never be published as a static copy,
 * which would freeze one installation's configuration into every other.
 */
export const MANAGED_TEMPLATE_GENERATORS: Readonly<
  Partial<Record<ManagedTemplatePath, VelvetTemplateGenerator>>
> = {
  ".github/ISSUE_TEMPLATE/maintenance.yml":
    "maintenance-issue-template-v1",
  ".github/workflows/maintenance-switch.yml": "maintenance-workflow-v1",
  ".github/workflows/velvet-response-times.yml":
    "response-times-workflow-v1",
  ".github/workflows/velvet-status.yml": "status-workflow-v1",
  ".github/workflows/velvet.yml": "pages-workflow-v1",
  "velvet.lock.json": "version-lock-v1",
};

const updateError = (
  code: UpdateValidationErrorCode,
  path: string,
  message: string,
): UpdateValidationError => ({ code, path, message });

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function inspectSchemaVersion(
  value: unknown,
  expected: number,
  code:
    | "UNSUPPORTED_RELEASE_MANIFEST_VERSION"
    | "UNSUPPORTED_UPDATE_LOCK_VERSION",
  noun: string,
): UpdateValidationError[] {
  if (
    !isRecord(value) ||
    !("schemaVersion" in value) ||
    value.schemaVersion === expected
  ) {
    return [];
  }
  return [
    updateError(
      code,
      "/schemaVersion",
      `${noun} schemaVersion must be ${expected}.`,
    ),
  ];
}

function structuralValidation<T>(
  schema: Parameters<typeof Value.Check>[0],
  value: unknown,
  code: "INVALID_RELEASE_MANIFEST" | "INVALID_UPDATE_LOCK",
  noun: string,
): UpdateValidationResult<T> | null {
  if (Value.Check(schema, value)) return null;
  const error = Value.Errors(schema, value).First();
  return {
    success: false,
    errors: [
      updateError(
        code,
        error?.path || "/",
        `${noun} does not match the Velvet schema at the reported path.`,
      ),
    ],
  };
}

interface ParsedSemanticVersion {
  core: [number, number, number];
  prerelease: string[] | null;
}

function parseSemanticVersion(value: string): ParsedSemanticVersion {
  const withoutBuild = value.split("+", 1)[0]!;
  const separator = withoutBuild.indexOf("-");
  const coreSource =
    separator === -1 ? withoutBuild : withoutBuild.slice(0, separator);
  const parts = coreSource.split(".").map((part) => Number(part));
  return {
    core: [parts[0]!, parts[1]!, parts[2]!],
    prerelease:
      separator === -1
        ? null
        : withoutBuild.slice(separator + 1).split("."),
  };
}

function comparePrerelease(
  left: string[] | null,
  right: string[] | null,
): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftNumeric = /^[0-9]+$/u.test(leftIdentifier);
    const rightNumeric = /^[0-9]+$/u.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return Number(leftIdentifier) - Number(rightIdentifier);
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

export function compareVelvetSemanticVersions(
  left: string,
  right: string,
): number {
  const leftVersion = parseSemanticVersion(left);
  const rightVersion = parseSemanticVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = leftVersion.core[index]! - rightVersion.core[index]!;
    if (difference !== 0) return difference;
  }
  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

function inspectTemplateRepository(
  repository: string,
): UpdateValidationError[] {
  return repository === VELVET_TEMPLATE_REPOSITORY
    ? []
    : [
        updateError(
          "UNTRUSTED_TEMPLATE_REPOSITORY",
          "/template/repository",
          "Managed updates must use the official Velvet template repository.",
        ),
      ];
}

function inspectManagedFiles(
  manifest: VelvetReleaseManifest,
): UpdateValidationError[] {
  const paths = new Set<string>();
  for (const [index, file] of manifest.managedFiles.entries()) {
    const basePath = `/managedFiles/${index}`;
    if (paths.has(file.path)) {
      return [
        updateError(
          "DUPLICATE_MANAGED_FILE",
          `${basePath}/path`,
          "Each managed template path may appear only once.",
        ),
      ];
    }
    paths.add(file.path);

    if (!MANAGED_TEMPLATE_PATH_SET.has(file.path)) {
      return [
        updateError(
          "UNMANAGED_TEMPLATE_PATH",
          `${basePath}/path`,
          "Release manifests may modify only Velvet-owned template files.",
        ),
      ];
    }

    const expectedGenerator =
      MANAGED_TEMPLATE_GENERATORS[file.path as ManagedTemplatePath];
    if (expectedGenerator !== undefined) {
      if (
        file.strategy !== "generate" ||
        file.generator !== expectedGenerator ||
        (file.path !== "velvet.lock.json" &&
          (!("sourcePath" in file) || file.sourcePath !== file.path))
      ) {
        return [
          updateError(
            "UNSAFE_GENERATED_FILE",
            basePath,
            "Configuration-dependent template files must use their registered deterministic generator.",
          ),
        ];
      }
    } else if (
      file.strategy !== "replace" ||
      file.sourcePath !== file.path
    ) {
      return [
        updateError(
          "UNSAFE_REPLACED_FILE",
          basePath,
          "Static template files must be copied from the same path in the immutable template revision.",
        ),
      ];
    }
  }
  return [];
}

export function validateVelvetVersionLock(
  value: unknown,
): VersionLockValidationResult {
  const versionErrors = inspectSchemaVersion(
    value,
    UPDATE_LOCK_SCHEMA_VERSION,
    "UNSUPPORTED_UPDATE_LOCK_VERSION",
    "Version-lock",
  );
  if (versionErrors.length > 0) {
    return { success: false, errors: versionErrors };
  }

  const invalid = structuralValidation<VelvetVersionLock>(
    VelvetVersionLockSchema,
    value,
    "INVALID_UPDATE_LOCK",
    "Version lock",
  );
  if (invalid !== null) return invalid;
  const lock = value as VelvetVersionLock;
  const repositoryErrors = inspectTemplateRepository(
    lock.template.repository,
  );
  if (repositoryErrors.length > 0) {
    return { success: false, errors: repositoryErrors };
  }
  return { success: true, data: lock };
}

export function validateVelvetReleaseManifest(
  value: unknown,
): ReleaseManifestValidationResult {
  const versionErrors = inspectSchemaVersion(
    value,
    RELEASE_MANIFEST_SCHEMA_VERSION,
    "UNSUPPORTED_RELEASE_MANIFEST_VERSION",
    "Release-manifest",
  );
  if (versionErrors.length > 0) {
    return { success: false, errors: versionErrors };
  }

  const invalid = structuralValidation<VelvetReleaseManifest>(
    VelvetReleaseManifestSchema,
    value,
    "INVALID_RELEASE_MANIFEST",
    "Release manifest",
  );
  if (invalid !== null) return invalid;
  const manifest = value as VelvetReleaseManifest;

  const repositoryErrors = inspectTemplateRepository(
    manifest.template.repository,
  );
  if (repositoryErrors.length > 0) {
    return { success: false, errors: repositoryErrors };
  }

  if (
    manifest.automaticInstallEligible &&
    (manifest.releaseType !== "security" ||
      manifest.compatibility.configurationMigrationRequired ||
      manifest.compatibility.dataMigrationRequired)
  ) {
    return {
      success: false,
      errors: [
        updateError(
          "UNSAFE_AUTOMATIC_UPDATE",
          "/automaticInstallEligible",
          "Only migration-free security releases may be eligible for automatic installation.",
        ),
      ],
    };
  }

  if (
    compareVelvetSemanticVersions(
      manifest.version,
      manifest.compatibility.minimumInstalledVersion,
    ) < 0
  ) {
    return {
      success: false,
      errors: [
        updateError(
          "INVALID_RELEASE_COMPATIBILITY",
          "/compatibility/minimumInstalledVersion",
          "The minimum installed version cannot be newer than the release.",
        ),
      ],
    };
  }

  const managedFileErrors = inspectManagedFiles(manifest);
  if (managedFileErrors.length > 0) {
    return { success: false, errors: managedFileErrors };
  }
  if (
    !manifest.managedFiles.some((file) => file.path === "velvet.lock.json")
  ) {
    return {
      success: false,
      errors: [
        updateError(
          "MISSING_VERSION_LOCK",
          "/managedFiles",
          "Every release must generate the installed-version lock.",
        ),
      ],
    };
  }
  return { success: true, data: manifest };
}

function parseJson<T>(
  source: string,
  validate: (value: unknown) => UpdateValidationResult<T>,
  code: "INVALID_RELEASE_MANIFEST" | "INVALID_UPDATE_LOCK",
  noun: string,
): UpdateValidationResult<T> {
  try {
    return validate(JSON.parse(source) as unknown);
  } catch {
    return {
      success: false,
      errors: [
        updateError(code, "/", `${noun} JSON could not be parsed.`),
      ],
    };
  }
}

export function parseVelvetVersionLock(
  source: string,
): VersionLockValidationResult {
  return parseJson(
    source,
    validateVelvetVersionLock,
    "INVALID_UPDATE_LOCK",
    "Version lock",
  );
}

export function parseVelvetReleaseManifest(
  source: string,
): ReleaseManifestValidationResult {
  return parseJson(
    source,
    validateVelvetReleaseManifest,
    "INVALID_RELEASE_MANIFEST",
    "Release manifest",
  );
}
