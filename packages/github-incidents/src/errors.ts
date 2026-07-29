import { randomUUID } from "node:crypto";

import type { GitHubIncidentErrorLogRecord } from "./types.js";

export type GitHubIncidentsErrorCode =
  | "GITHUB_ISSUES_DISABLED"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_REQUEST_FAILED"
  | "INVALID_GITHUB_RESPONSE"
  | "INVALID_INCIDENT_DOCUMENT"
  | "INVALID_MAINTENANCE"
  | "INVALID_METADATA";

interface GitHubIncidentsErrorOptions extends ErrorOptions {
  errorId?: string;
  status?: number;
}

const ERROR_MESSAGES: Record<GitHubIncidentsErrorCode, string> = {
  GITHUB_ISSUES_DISABLED: "GitHub Issues are disabled for this repository",
  GITHUB_RATE_LIMITED: "GitHub API rate limit reached",
  GITHUB_REQUEST_FAILED: "GitHub API request failed",
  INVALID_GITHUB_RESPONSE: "GitHub API returned an invalid response",
  INVALID_INCIDENT_DOCUMENT: "Generated incident data is invalid",
  INVALID_MAINTENANCE: "Maintenance issue data is invalid",
  INVALID_METADATA: "Velvet issue metadata is invalid",
};

export class GitHubIncidentsError extends Error {
  readonly code: GitHubIncidentsErrorCode;
  readonly errorId: string;
  readonly status: number | undefined;

  constructor(
    code: GitHubIncidentsErrorCode,
    options: GitHubIncidentsErrorOptions = {},
  ) {
    super(ERROR_MESSAGES[code], { cause: options.cause });
    this.name = "GitHubIncidentsError";
    this.code = code;
    this.errorId = options.errorId ?? randomUUID();
    this.status = options.status;
  }
}

export function githubIncidentErrorLog(
  operation: string,
  error: GitHubIncidentsError,
): GitHubIncidentErrorLogRecord {
  return {
    operation,
    result: "failed",
    code: error.code,
    errorId: error.errorId,
    status: error.status ?? null,
  };
}
