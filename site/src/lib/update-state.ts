/**
 * Translation from what an update operation reports into what a person is
 * shown.
 *
 * The orchestrator reports machine states and reasons. Neither is meant for a
 * reader: `waiting_for_publication` and `skipped` describe the mechanism, not
 * what happened to someone's status page. This module is the single place that
 * translation happens, so the wording cannot drift between the compact notice
 * and the full section.
 */

import type {
  ManagedUpdateReason,
  ManagedUpdateState,
} from "@velvet/contracts";

/**
 * What the interface does with an operation.
 *
 * @property tone - Drives presentation only. `progress` means something is
 *   still running, so the interface must keep polling rather than settle.
 * @property title - Short enough for the compact notice.
 * @property detail - One sentence explaining what it means for the page.
 * @property canRetry - Whether offering the action again could plausibly help.
 */
export interface UpdateOutcome {
  tone: "progress" | "success" | "neutral" | "warning";
  title: string;
  detail: string;
  canRetry: boolean;
}

const PROGRESS: Record<string, UpdateOutcome> = {
  waiting_for_checks: {
    tone: "progress",
    title: "Checking the update",
    detail: "Velvet is verifying the new version before installing it. Your page is unchanged.",
    canRetry: false,
  },
  waiting_for_publication: {
    tone: "progress",
    title: "Publishing your page",
    detail: "The update is installed and your status page is being rebuilt.",
    canRetry: false,
  },
  restoring: {
    tone: "progress",
    title: "Restoring the previous version",
    detail: "Publishing failed, so Velvet is putting the previous version back.",
    canRetry: false,
  },
  waiting_for_recovery: {
    tone: "progress",
    title: "Republishing the previous version",
    detail: "The previous version is back and your status page is being rebuilt.",
    canRetry: false,
  },
};

const REASONS: Record<ManagedUpdateReason, UpdateOutcome> = {
  automatic_security_disabled: {
    tone: "neutral",
    title: "Automatic updates are off",
    detail: "This security update is ready to install whenever you choose.",
    canRetry: true,
  },
  release_not_automatic: {
    tone: "neutral",
    title: "Needs your confirmation",
    detail: "This release is not a security update, so it installs only when you ask.",
    canRetry: true,
  },
  already_installed: {
    tone: "success",
    title: "Already up to date",
    detail: "Your page is running this version.",
    canRetry: false,
  },
  newer_version_installed: {
    tone: "success",
    title: "Already up to date",
    detail: "Your page is running a newer version than this one.",
    canRetry: false,
  },
  incompatible_release: {
    tone: "warning",
    title: "Cannot install this version",
    detail: "This release does not support the version your page currently runs.",
    canRetry: false,
  },
  migration_required: {
    tone: "neutral",
    title: "Needs a migration",
    detail: "This release changes how configuration or data is stored, so it is not installed automatically.",
    canRetry: false,
  },
  checks_failed: {
    tone: "warning",
    title: "The update did not pass its checks",
    detail: "Nothing was changed. Your page is still running the previous version.",
    canRetry: true,
  },
  merge_rejected: {
    tone: "warning",
    title: "GitHub declined the update",
    detail: "Nothing was changed. Your page is still running the previous version.",
    canRetry: true,
  },
  update_closed: {
    tone: "warning",
    title: "The update was closed",
    detail: "Someone closed the update before it finished. Nothing was changed.",
    canRetry: true,
  },
  repository_changed: {
    tone: "warning",
    title: "Your repository changed during the update",
    detail: "Velvet stopped to avoid overwriting the change. Nothing was lost.",
    canRetry: true,
  },
  protected_branch_target: {
    tone: "warning",
    title: "Cannot update this repository",
    detail: "Its default branch holds generated status history, which Velvet never writes to.",
    canRetry: false,
  },
  protected_files_changed: {
    tone: "warning",
    title: "The update touched protected files",
    detail: "Velvet stopped before installing it. Your configuration and history are untouched.",
    canRetry: false,
  },
  data_branch_changed: {
    tone: "warning",
    title: "Your status history changed unexpectedly",
    detail: "Velvet stopped the update so the history can be checked first.",
    canRetry: false,
  },
  recovery_failed: {
    tone: "warning",
    title: "The previous version could not be republished",
    detail: "Your repository holds the previous version, but the page did not rebuild.",
    canRetry: true,
  },
};

const TERMINAL: Record<string, UpdateOutcome> = {
  succeeded: {
    tone: "success",
    title: "Update installed",
    detail: "Your status page is running the new version.",
    canRetry: false,
  },
  restored: {
    tone: "warning",
    title: "Update rolled back",
    detail: "Publishing failed, so Velvet restored and republished the previous version.",
    canRetry: true,
  },
};

const UNKNOWN: UpdateOutcome = {
  tone: "warning",
  title: "The update could not be completed",
  detail: "Nothing was changed. You can try again.",
  canRetry: true,
};

/**
 * Describes one update operation for a reader.
 *
 * A reason takes precedence over its state, because `skipped` and `failed`
 * carry no meaning on their own whilst the reason says what actually happened.
 * An unrecognized combination falls back to a safe, non-committal message
 * rather than exposing the raw identifier.
 *
 * @param state - Machine state from the operation.
 * @param reason - Accompanying reason, where the operation reported one.
 * @returns What to show, including whether retrying is worth offering.
 */
export function describeUpdate(
  state: ManagedUpdateState,
  reason?: ManagedUpdateReason,
): UpdateOutcome {
  const progress = PROGRESS[state];
  if (progress) return progress;
  if (reason && REASONS[reason]) return REASONS[reason]!;
  return TERMINAL[state] ?? UNKNOWN;
}

/** Whether the interface must keep watching this operation. */
export function isUpdateRunning(outcome: UpdateOutcome): boolean {
  return outcome.tone === "progress";
}
