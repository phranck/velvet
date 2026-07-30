import type { SetupErrorCode, SetupPublicError } from "@velvet/contracts";

export class SetupServiceError extends Error {
  readonly code: SetupErrorCode;
  readonly status: number;
  readonly recoverable: boolean;

  constructor(
    code: SetupErrorCode,
    message: string,
    options: { status?: number; recoverable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "SetupServiceError";
    this.code = code;
    this.status = options.status ?? 500;
    this.recoverable = options.recoverable ?? false;
  }
}

export function publicSetupError(
  error: SetupServiceError,
  errorId: string,
): SetupPublicError {
  return { code: error.code, message: error.message, errorId };
}
