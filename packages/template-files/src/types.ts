import type {
  NormalizedVelvetConfiguration,
  VelvetReleaseManifest,
} from "@velvet/contracts";

export type TemplateSourceErrorCode =
  | "INVALID_TEMPLATE_SOURCE"
  | "MISSING_TEMPLATE_SOURCE"
  | "TEMPLATE_SOURCE_HASH_MISMATCH";

export interface TemplateSourceError {
  code: TemplateSourceErrorCode;
  path: string;
  message: string;
}

export type TemplateFilesErrorCode =
  | "INVALID_RELEASE_MANIFEST"
  | "UNSUPPORTED_TEMPLATE_GENERATOR"
  | TemplateSourceErrorCode;

export interface TemplateFilesError {
  code: TemplateFilesErrorCode;
  path: string;
  message: string;
}

export interface MaterializedTemplateFile {
  path: string;
  content: string;
  sha256: string;
}

export interface MaterializeManagedTemplateFilesInput {
  manifest: VelvetReleaseManifest;
  configuration: NormalizedVelvetConfiguration;
  sources: Readonly<Record<string, string>>;
  /**
   * The running number this installation was issued, if it has one.
   *
   * Every other field of the version lock describes the release being written
   * and is rebuilt from the manifest on each update. This one describes the
   * installation, so it has to be supplied by whoever knows it: the issued
   * number when provisioning, and the number already in the lock when updating.
   * Omitting it writes a lock without a serial, which is what an installation
   * made before serials existed carries and what keeps its page from claiming a
   * number it was never given.
   */
  serial?: number;
}

export type ManagedTemplateFilesResult =
  | { success: true; data: { files: MaterializedTemplateFile[] } }
  | { success: false; errors: TemplateFilesError[] };

export type ReleasePublicationErrorCode =
  | "INCORRECT_RELEASE_CLASSIFICATION"
  | "INCOMPATIBLE_PREVIOUS_RELEASE"
  | "INCONSISTENT_SCHEMA_MIGRATION"
  | "INCOMPLETE_MANAGED_FILE_SET"
  | "INVALID_PREVIOUS_RELEASE"
  | "INVALID_RELEASE_MANIFEST"
  | "NON_FORWARD_RELEASE"
  | "SOURCE_REVISION_MISMATCH"
  | TemplateSourceErrorCode;

export interface ReleasePublicationError {
  code: ReleasePublicationErrorCode;
  path: string;
  message: string;
}

export interface ReleaseTemplateSource {
  repository: string;
  commit: string;
  files: Readonly<Record<string, string>>;
}

export interface ValidateReleasePublicationInput {
  manifest: unknown;
  previousManifest?: unknown;
  source: ReleaseTemplateSource;
}

/**
 * Everything a release needs beyond the template revision it is cut from.
 *
 * The managed file list is deliberately absent because it is derived from the
 * source rather than supplied. Hand-written file lists were how a generated
 * file could be published as a static copy, which would freeze one
 * installation's configuration into every other installation.
 *
 * @property version - Semantic version this release publishes.
 * @property releaseType - Classification that must match the version step, so a
 *   feature changes the major or minor part whilst a fix or security release
 *   changes only the patch part.
 * @property automaticInstallEligible - Whether unattended installation is
 *   allowed, which validation restricts to migration-free security releases.
 * @property source - Immutable template revision and the file contents read
 *   from it.
 * @property releaseNotes - Markdown shown in the Configurator, never rendered
 *   as raw HTML.
 * @property previousManifest - Immediately preceding release, omitted for a
 *   first publication.
 */
export interface BuildReleaseManifestInput {
  version: string;
  releaseType: "security" | "fix" | "feature";
  automaticInstallEligible: boolean;
  compatibility: {
    minimumInstalledVersion: string;
    configurationSchemaVersion: number;
    dataSchemaVersion: number;
    configurationMigrationRequired: boolean;
    dataMigrationRequired: boolean;
  };
  source: ReleaseTemplateSource;
  releaseNotes: string;
  previousManifest?: unknown;
}

export type ReleasePublicationResult =
  | { success: true; data: VelvetReleaseManifest }
  | { success: false; errors: ReleasePublicationError[] };
