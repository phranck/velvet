import type { RequestOptions } from "node:http";

export type CheckFailureCode =
  | "ASSERTION_MISMATCH"
  | "CANCELLED"
  | "CONNECTION_ERROR"
  | "DNS_ERROR"
  | "INVALID_JSON"
  | "INVALID_REDIRECT"
  | "INVALID_REQUEST_HEADER"
  | "RESPONSE_BODY_TOO_LARGE"
  | "SECRET_NOT_FOUND"
  | "TIMEOUT"
  | "TLS_ERROR"
  | "TOO_MANY_REDIRECTS"
  | "UNEXPECTED_STATUS"
  | "UNKNOWN_ERROR";

export interface CheckExecutionError {
  code: CheckFailureCode;
  message: string;
}

export interface HttpCheckExecutionResult {
  checkId: string;
  checkedAt: string;
  outcome: "success" | "failure";
  latencyMs: number;
  statusCode: number | null;
  error: CheckExecutionError | null;
}

export interface HttpExecutorDependencies {
  signal?: AbortSignal;
  resolveSecret?: (name: string) => string | undefined;
  lookup?: NonNullable<RequestOptions["lookup"]>;
  monotonicNow?: () => number;
  wallNow?: () => Date;
}
