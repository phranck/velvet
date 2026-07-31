import type {
  VelvetReleaseManifest,
  VelvetVersionLock,
} from "./schemas.js";

export type UpdateValidationErrorCode =
  | "DUPLICATE_MANAGED_FILE"
  | "INVALID_RELEASE_COMPATIBILITY"
  | "INVALID_RELEASE_MANIFEST"
  | "INVALID_UPDATE_LOCK"
  | "MISSING_VERSION_LOCK"
  | "UNMANAGED_TEMPLATE_PATH"
  | "UNTRUSTED_TEMPLATE_REPOSITORY"
  | "UNSAFE_AUTOMATIC_UPDATE"
  | "UNSAFE_GENERATED_FILE"
  | "UNSAFE_REPLACED_FILE"
  | "UNSUPPORTED_RELEASE_MANIFEST_VERSION"
  | "UNSUPPORTED_UPDATE_LOCK_VERSION";

export interface UpdateValidationError {
  code: UpdateValidationErrorCode;
  path: string;
  message: string;
}

export type UpdateValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: UpdateValidationError[] };

export type VersionLockValidationResult =
  UpdateValidationResult<VelvetVersionLock>;
export type ReleaseManifestValidationResult =
  UpdateValidationResult<VelvetReleaseManifest>;
