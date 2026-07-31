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

export type ReleasePublicationResult =
  | { success: true; data: VelvetReleaseManifest }
  | { success: false; errors: ReleasePublicationError[] };
