import type { SetupErrorCode } from "@velvet/contracts";

import { GitHubApiError } from "./github.js";
import type { ManagedUpdateErrorCode } from "./update-error.js";

export interface AuditLogInput {
  level: "info" | "warn" | "error";
  requestId: string;
  route: string;
  operation: string;
  status: number;
  outcome: "succeeded" | "failed" | "rejected" | "fallback";
  /** Stable code from whichever boundary reported this. */
  code?: SetupErrorCode | ManagedUpdateErrorCode;
  errorId?: string;
  /**
   * Identifiers that make one line diagnosable, such as which repository a
   * scheduled sweep was working on. Numbers and short identifiers only:
   * nothing here is redacted, so nothing secret belongs in it.
   */
  /** Booleans are carried as they are, so a log reader sees a yes or no
   * rather than a stringified one. */
  context?: Record<string, string | number | boolean>;
  cause?: unknown;
}

interface AuditLoggerOptions {
  write?: (line: string) => void;
  now?: () => string;
}

export type AuditLogger = (input: AuditLogInput) => void;

export function createAuditLogger(
  options: AuditLoggerOptions = {},
): AuditLogger {
  const write = options.write ?? ((line) => console.log(line));
  const now = options.now ?? (() => new Date().toISOString());
  return (input) => {
    const { cause, ...fields } = input;
    write(
      JSON.stringify({
        timestamp: now(),
        ...fields,
        ...(cause === undefined ? {} : { cause: redactedCause(cause) }),
      }),
    );
  };
}

function redactedCause(
  cause: unknown,
  depth = 0,
): Record<string, unknown> {
  if (cause instanceof GitHubApiError) {
    return {
      name: cause.name,
      status: cause.status,
      githubRequestId: cause.requestId,
      retryAfterSeconds: cause.retryAfterSeconds,
    };
  }
  if (cause instanceof Error) {
    return {
      name: cause.name,
      ...(depth < 2 && cause.cause !== undefined
        ? { cause: redactedCause(cause.cause, depth + 1) }
        : {}),
    };
  }
  return { name: "UnknownError" };
}
