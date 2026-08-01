import { randomUUID } from "node:crypto";

export type MonitorActionErrorCode =
  | "CONFIGURATION_UNREADABLE"
  | "DATA_BRANCH_CONFLICT"
  | "DATA_BRANCH_GIT_FAILED"
  | "DATA_BRANCH_INVALID"
  | "INCIDENT_CLIENT_REQUIRED"
  | "INTERNAL_FAILURE"
  | "INVALID_CONFIGURATION"
  | "INVALID_INCIDENT_DOCUMENT"
  | "INVALID_MODE"
  | "INVALID_OBSERVATIONS"
  | "REPOSITORY_MISMATCH"
  | "UNOBSERVED_CHECK";

const messages: Record<MonitorActionErrorCode, string> = {
  CONFIGURATION_UNREADABLE: "Velvet configuration could not be read",
  DATA_BRANCH_CONFLICT: "Velvet data changed during publication",
  DATA_BRANCH_GIT_FAILED: "Velvet data could not be published",
  DATA_BRANCH_INVALID: "Stored Velvet data is invalid",
  INCIDENT_CLIENT_REQUIRED: "GitHub incident access is unavailable",
  INTERNAL_FAILURE: "Velvet monitor execution failed",
  INVALID_CONFIGURATION: "Velvet configuration is invalid",
  INVALID_INCIDENT_DOCUMENT: "Velvet incident data is invalid",
  INVALID_MODE: "Velvet monitor mode is invalid",
  INVALID_OBSERVATIONS: "Velvet check observations are incomplete",
  REPOSITORY_MISMATCH: "Velvet configuration targets another repository",
  UNOBSERVED_CHECK: "Velvet could not safely observe every configured check",
};

export class MonitorActionError extends Error {
  readonly code: MonitorActionErrorCode;
  readonly errorId: string;

  /**
   * Where the failure was located, when the failure has a location.
   *
   * Carries the JSON pointer the configuration validator rejected, for example
   * `/updates`. A pointer into a file its own owner wrote gives away nothing,
   * and it is the single most useful thing to know when a configuration is
   * refused: without it the report says only that something is wrong.
   */
  readonly detail: string | null;

  constructor(
    code: MonitorActionErrorCode,
    options: ErrorOptions & { errorId?: string; detail?: string } = {},
  ) {
    super(messages[code], { cause: options.cause });
    this.name = "MonitorActionError";
    this.code = code;
    this.errorId = options.errorId ?? randomUUID();
    this.detail = options.detail ?? null;
  }
}
