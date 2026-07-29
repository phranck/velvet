export type UpptimeAdapterErrorCode =
  | "CONTRACT_VALIDATION_FAILED"
  | "DESTINATION_NOT_EMPTY"
  | "DESTINATION_WRITE_FAILED"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_REQUEST_FAILED"
  | "INVALID_INPUT"
  | "MALFORMED_HISTORY_COMMIT"
  | "MISSING_HISTORY"
  | "PARTIAL_UPSTREAM_DATA";

interface UpptimeAdapterErrorOptions extends ErrorOptions {
  status?: number;
}

export class UpptimeAdapterError extends Error {
  readonly code: UpptimeAdapterErrorCode;
  readonly status: number | undefined;

  constructor(
    code: UpptimeAdapterErrorCode,
    message: string,
    options?: UpptimeAdapterErrorOptions,
  ) {
    super(message, { cause: options?.cause });
    this.name = "UpptimeAdapterError";
    this.code = code;
    this.status = options?.status;
  }
}
