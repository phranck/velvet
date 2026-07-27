export type ContractValidationErrorCode =
  | "DUPLICATE_CHECK_ID"
  | "DUPLICATE_EVENT_ID"
  | "DUPLICATE_RESPONSE_SERIES"
  | "DUPLICATE_SAMPLE_TIMESTAMP"
  | "DUPLICATE_SERVICE_ID"
  | "INVALID_DURATION_RANGE"
  | "INVALID_DOCUMENT"
  | "INVALID_EVENT_STATE"
  | "INVALID_PROTOCOL"
  | "INVALID_TIMESTAMP"
  | "NEGATIVE_DURATION"
  | "TIMESTAMP_OUT_OF_RANGE"
  | "UNSUPPORTED_SCHEMA_VERSION";

export interface ContractValidationError {
  code: ContractValidationErrorCode;
  path: string;
  message: string;
}

export type ContractValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ContractValidationError[] };
