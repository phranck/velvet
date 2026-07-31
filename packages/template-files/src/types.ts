import type {
  NormalizedVelvetConfiguration,
  VelvetReleaseManifest,
} from "@velvet/contracts";

export type TemplateFilesErrorCode =
  | "INVALID_RELEASE_MANIFEST"
  | "INVALID_TEMPLATE_SOURCE"
  | "MISSING_TEMPLATE_SOURCE"
  | "TEMPLATE_SOURCE_HASH_MISMATCH"
  | "UNSUPPORTED_TEMPLATE_GENERATOR";

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
