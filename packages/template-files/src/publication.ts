import {
  compareVelvetSemanticVersions,
  MANAGED_TEMPLATE_PATHS,
  validateVelvetReleaseManifest,
  type VelvetReleaseManifest,
} from "@velvet/contracts";

import { verifyTemplateSource } from "./source.js";
import type {
  ReleasePublicationError,
  ReleasePublicationErrorCode,
  ReleasePublicationResult,
  ValidateReleasePublicationInput,
} from "./types.js";

function publicationError(
  code: ReleasePublicationErrorCode,
  path: string,
  message: string,
): ReleasePublicationError {
  return { code, path, message };
}

function invalidManifest(
  value: unknown,
  previous: boolean,
):
  | { success: true; data: VelvetReleaseManifest }
  | { success: false; error: ReleasePublicationError } {
  const validation = validateVelvetReleaseManifest(value);
  if (validation.success) return validation;
  return {
    success: false,
    error: publicationError(
      previous ? "INVALID_PREVIOUS_RELEASE" : "INVALID_RELEASE_MANIFEST",
      validation.errors[0]?.path ?? "/",
      previous
        ? "The previous release manifest is invalid."
        : "The release manifest is invalid.",
    ),
  };
}

function semanticCore(version: string): [number, number, number] {
  const [major, minor, patch] = version
    .split(/[+-]/u, 1)[0]!
    .split(".")
    .map(Number);
  return [major!, minor!, patch!];
}

function schemaMigrationError(
  previousVersion: number,
  nextVersion: number,
  migrationRequired: boolean,
  field: "configuration" | "data",
): ReleasePublicationError | null {
  const changed = nextVersion !== previousVersion;
  if (nextVersion >= previousVersion && changed === migrationRequired) {
    return null;
  }
  return publicationError(
    "INCONSISTENT_SCHEMA_MIGRATION",
    `/compatibility/${field}SchemaVersion`,
    "Schema versions must move forward exactly when the matching migration flag is enabled.",
  );
}

export function validateReleasePublication(
  input: ValidateReleasePublicationInput,
): ReleasePublicationResult {
  const candidateValidation = invalidManifest(input.manifest, false);
  if (!candidateValidation.success) {
    return { success: false, errors: [candidateValidation.error] };
  }
  const manifest = candidateValidation.data;

  const paths = new Set(manifest.managedFiles.map((file) => file.path));
  if (
    paths.size !== MANAGED_TEMPLATE_PATHS.length ||
    MANAGED_TEMPLATE_PATHS.some((path) => !paths.has(path))
  ) {
    return {
      success: false,
      errors: [
        publicationError(
          "INCOMPLETE_MANAGED_FILE_SET",
          "/managedFiles",
          "A published release must contain every Velvet-owned template file.",
        ),
      ],
    };
  }

  if (
    input.source.repository !== manifest.template.repository ||
    input.source.commit !== manifest.template.commit
  ) {
    return {
      success: false,
      errors: [
        publicationError(
          "SOURCE_REVISION_MISMATCH",
          "/template",
          "Release files must come from the exact immutable template revision in the manifest.",
        ),
      ],
    };
  }

  for (const file of manifest.managedFiles) {
    if (file.path === "velvet.lock.json") continue;
    const verification = verifyTemplateSource(file, input.source.files);
    if ("error" in verification) {
      return { success: false, errors: [verification.error] };
    }
  }

  if (input.previousManifest === undefined) {
    return { success: true, data: manifest };
  }
  const previousValidation = invalidManifest(input.previousManifest, true);
  if (!previousValidation.success) {
    return { success: false, errors: [previousValidation.error] };
  }
  const previous = previousValidation.data;

  if (compareVelvetSemanticVersions(manifest.version, previous.version) <= 0) {
    return {
      success: false,
      errors: [
        publicationError(
          "NON_FORWARD_RELEASE",
          "/version",
          "A published version must be newer than the previous release.",
        ),
      ],
    };
  }
  if (
    compareVelvetSemanticVersions(
      manifest.compatibility.minimumInstalledVersion,
      previous.version,
    ) > 0
  ) {
    return {
      success: false,
      errors: [
        publicationError(
          "INCOMPATIBLE_PREVIOUS_RELEASE",
          "/compatibility/minimumInstalledVersion",
          "The immediately previous release must be eligible to install this release.",
        ),
      ],
    };
  }

  const configurationMigrationError = schemaMigrationError(
    previous.compatibility.configurationSchemaVersion,
    manifest.compatibility.configurationSchemaVersion,
    manifest.compatibility.configurationMigrationRequired,
    "configuration",
  );
  if (configurationMigrationError) {
    return { success: false, errors: [configurationMigrationError] };
  }
  const dataMigrationError = schemaMigrationError(
    previous.compatibility.dataSchemaVersion,
    manifest.compatibility.dataSchemaVersion,
    manifest.compatibility.dataMigrationRequired,
    "data",
  );
  if (dataMigrationError) {
    return { success: false, errors: [dataMigrationError] };
  }

  const [previousMajor, previousMinor] = semanticCore(previous.version);
  const [candidateMajor, candidateMinor] = semanticCore(manifest.version);
  const featureSized =
    candidateMajor !== previousMajor || candidateMinor !== previousMinor;
  if ((manifest.releaseType === "feature") !== featureSized) {
    return {
      success: false,
      errors: [
        publicationError(
          "INCORRECT_RELEASE_CLASSIFICATION",
          "/releaseType",
          "Feature releases must change the major or minor version; fix and security releases must change only the patch version.",
        ),
      ],
    };
  }

  return { success: true, data: manifest };
}
