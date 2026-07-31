/**
 * Shared vocabulary for the state of a managed update operation.
 *
 * The service reports these and the interface translates them for a reader, so
 * they are a contract between two packages rather than an implementation
 * detail of either. Defining them here is what stops a newly added reason from
 * silently reaching an interface that has no wording for it.
 */

/** Where an update operation currently stands. */
export const MANAGED_UPDATE_STATES = [
  "waiting_for_checks",
  "waiting_for_publication",
  "restoring",
  "waiting_for_recovery",
  "succeeded",
  "restored",
  "skipped",
  "failed",
] as const;

/**
 * Why an operation was skipped or failed.
 *
 * A state of `skipped` or `failed` carries no meaning on its own; the reason
 * is what says whether an installation is fine, waiting for a decision, or
 * needs attention.
 */
export const MANAGED_UPDATE_REASONS = [
  "automatic_security_disabled",
  "release_not_automatic",
  "already_installed",
  "newer_version_installed",
  "incompatible_release",
  "migration_required",
  "checks_failed",
  "merge_rejected",
  "update_closed",
  "repository_changed",
  "protected_branch_target",
  "protected_files_changed",
  "data_branch_changed",
  "recovery_failed",
] as const;

export type ManagedUpdateState = (typeof MANAGED_UPDATE_STATES)[number];
export type ManagedUpdateReason = (typeof MANAGED_UPDATE_REASONS)[number];
