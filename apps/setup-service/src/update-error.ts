import { GitHubApiError } from "./github-api.js";

/**
 * Stable identifiers for failures at the managed-update boundary.
 *
 * These are an interface. A consumer may branch on them and a support request
 * may quote them, so a code keeps its meaning once published. They describe
 * what a caller can do about a failure rather than where in the code it arose,
 * which is why there are few of them.
 */
export type ManagedUpdateErrorCode =
  /** The release to install is not a valid, complete Velvet release. */
  | "UPDATE_RELEASE_INVALID"
  /** The installation's own configuration or version lock cannot be used. */
  | "UPDATE_INSTALLATION_INVALID"
  /** The repository moved underneath the operation and must be re-read. */
  | "UPDATE_REPOSITORY_CHANGED"
  /** GitHub was temporarily unavailable, so the same request may be retried. */
  | "UPDATE_GITHUB_UNAVAILABLE"
  /** GitHub refused the request, so retrying it unchanged will fail again. */
  | "UPDATE_GITHUB_REJECTED"
  /** Anything else, deliberately opaque to the caller. */
  | "UPDATE_FAILED";

/**
 * Shape handed to a caller outside the update service.
 *
 * It carries no upstream response body, no configuration, and no repository
 * content. The `errorId` is what connects a user report to one log entry.
 */
export interface PublicManagedUpdateError {
  code: ManagedUpdateErrorCode;
  message: string;
  errorId: string;
}

const SAFE_MESSAGES: Record<ManagedUpdateErrorCode, string> = {
  UPDATE_RELEASE_INVALID: "The selected Velvet release could not be verified.",
  UPDATE_INSTALLATION_INVALID:
    "This installation's Velvet configuration could not be read.",
  UPDATE_REPOSITORY_CHANGED:
    "The repository changed while Velvet was updating it. Try again.",
  UPDATE_GITHUB_UNAVAILABLE:
    "GitHub was temporarily unavailable. Try again shortly.",
  UPDATE_GITHUB_REJECTED: "GitHub refused a required update operation.",
  UPDATE_FAILED: "The Velvet update could not be completed.",
};

/**
 * Failure at the managed-update boundary.
 *
 * The message is chosen from a fixed table by code rather than supplied by the
 * thrower, so an internal detail cannot reach a user through it. The original
 * cause is preserved for logging but is never part of the public shape.
 */
export class ManagedUpdateError extends Error {
  readonly code: ManagedUpdateErrorCode;
  readonly errorId: string;
  readonly retryable: boolean;

  constructor(
    code: ManagedUpdateErrorCode,
    options: { errorId: string; cause?: unknown } = { errorId: "" },
  ) {
    super(SAFE_MESSAGES[code], { cause: options.cause });
    this.name = "ManagedUpdateError";
    this.code = code;
    this.errorId = options.errorId;
    this.retryable =
      code === "UPDATE_GITHUB_UNAVAILABLE" || code === "UPDATE_REPOSITORY_CHANGED";
  }
}

/**
 * Classifies any thrown value into a stable public code.
 *
 * An error already carrying a code keeps it. A GitHub failure is split by
 * whether repeating the identical request could plausibly succeed. Everything
 * else becomes the opaque code, because guessing a more specific one from an
 * unrecognized error would publish a claim that is not backed by evidence.
 *
 * @param cause - The thrown value, of any type.
 * @returns The code describing what the caller can do about it.
 */
export function managedUpdateErrorCode(cause: unknown): ManagedUpdateErrorCode {
  if (cause instanceof ManagedUpdateError) return cause.code;
  if (cause instanceof GitHubApiError) {
    return cause.status >= 500 ||
      cause.status === 429 ||
      (cause.status === 403 && cause.retryAfterSeconds !== null)
      ? "UPDATE_GITHUB_UNAVAILABLE"
      : "UPDATE_GITHUB_REJECTED";
  }
  return "UPDATE_FAILED";
}

/**
 * Reduces an error to the shape that may leave the service.
 *
 * @param error - The boundary error being reported.
 * @returns Code, safe message, and error ID, and nothing else.
 */
export function publicManagedUpdateError(
  error: ManagedUpdateError,
): PublicManagedUpdateError {
  return {
    code: error.code,
    message: SAFE_MESSAGES[error.code],
    errorId: error.errorId,
  };
}
