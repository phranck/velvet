import type { VelvetReleaseManifest } from "@velvet/contracts";

import type { GitHubUpdateClient, GitHubUpdatePullRequest } from "./update-github-types.js";

export type ManagedUpdateTrigger = "manual" | "automatic-security";

export interface ManagedUpdateRequest {
  installationId: number;
  repositoryId: number;
  version: string;
  trigger: ManagedUpdateTrigger;
}

export interface ManagedUpdateRelease {
  manifest: VelvetReleaseManifest;
  sources: Readonly<Record<string, string>>;
}

export interface ManagedUpdateReleaseProvider {
  /**
   * Newest Velvet version this source can install.
   *
   * @returns The semantic version an installation can be brought up to.
   */
  latest(): string;
  /**
   * Resolves one release, including the template files it is cut from.
   *
   * @param version - Exact semantic version being requested.
   * @returns The validated manifest and its immutable template sources.
   * @throws When the source cannot serve that exact version, so an unknown or
   *   superseded version never silently resolves to a different release.
   */
  get(version: string): Promise<ManagedUpdateRelease>;
}

export type ManagedUpdateState =
  | "waiting_for_checks"
  | "waiting_for_publication"
  | "restoring"
  | "waiting_for_recovery"
  | "succeeded"
  | "restored"
  | "skipped"
  | "failed";

export type ManagedUpdateReason =
  | "automatic_security_disabled"
  | "release_not_automatic"
  | "already_installed"
  | "newer_version_installed"
  | "incompatible_release"
  | "migration_required"
  | "checks_failed"
  | "merge_rejected"
  | "update_closed"
  | "repository_changed"
  | "protected_branch_target"
  | "protected_files_changed"
  | "data_branch_changed"
  | "recovery_failed";

export interface ManagedUpdateResult {
  operationId: string;
  version: string;
  trigger: ManagedUpdateTrigger;
  state: ManagedUpdateState;
  reason?: ManagedUpdateReason;
  pullRequest?: Pick<GitHubUpdatePullRequest, "number" | "htmlUrl">;
}

/**
 * Structured record of one failed update, safe to write to a shared log.
 *
 * It identifies the operation well enough to diagnose it and carries no
 * configuration, no repository content, no credentials, and no upstream
 * response body.
 *
 * @property cause - Redact before writing. It may be any thrown value.
 */
export interface ManagedUpdateLogEntry {
  code: string;
  errorId: string;
  repositoryId: number;
  version: string;
  trigger: ManagedUpdateTrigger;
  outcome: "failed";
  cause: unknown;
}

export interface ManagedUpdateOrchestratorOptions {
  github: GitHubUpdateClient;
  releases: ManagedUpdateReleaseProvider;
  requiredCheckNames: readonly string[];
  maxReadAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  /** Receives one entry per failure. Redaction is the sink's responsibility. */
  log?: (entry: ManagedUpdateLogEntry) => void;
  /** Supplies the unique identifier a user can quote back. */
  errorId?: () => string;
}

export interface ManagedUpdateOrchestrator {
  reconcile(request: ManagedUpdateRequest): Promise<ManagedUpdateResult>;
}
