import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { CONTRACT_SCHEMA_VERSION } from "../schemas.js";
import type {
  ContractValidationError,
  ContractValidationErrorCode,
  ContractValidationResult,
} from "./types.js";

export type UnknownRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const contractError = (
  code: ContractValidationErrorCode,
  path: string,
  message: string,
): ContractValidationError => ({ code, path, message });

const isCanonicalTimestamp = (value: string): boolean => {
  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.valueOf()) && timestamp.toISOString() === value;
};

const isCanonicalDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
};

export function inspectSchemaVersion(
  value: unknown,
): ContractValidationError[] {
  if (
    !isRecord(value) ||
    !("schemaVersion" in value) ||
    value.schemaVersion === CONTRACT_SCHEMA_VERSION
  ) {
    return [];
  }

  return [
    contractError(
      "UNSUPPORTED_SCHEMA_VERSION",
      "/schemaVersion",
      `Schema version ${String(value.schemaVersion)} is not supported.`,
    ),
  ];
}

export function inspectTimestamp(
  value: unknown,
  path: string,
): ContractValidationError[] {
  if (typeof value !== "string" || isCanonicalTimestamp(value)) {
    return [];
  }

  return [
    contractError(
      "INVALID_TIMESTAMP",
      path,
      "Timestamp must be a real UTC ISO 8601 value with millisecond precision.",
    ),
  ];
}

export function inspectDate(
  value: unknown,
  path: string,
): ContractValidationError[] {
  if (typeof value !== "string" || isCanonicalDate(value)) {
    return [];
  }

  return [
    contractError(
      "INVALID_TIMESTAMP",
      path,
      "Date must be a real UTC calendar date in YYYY-MM-DD format.",
    ),
  ];
}

export function validateSchema<T extends TSchema>(
  schema: T,
  value: unknown,
): ContractValidationResult<Static<T>> {
  if (Value.Check(schema, value)) {
    return { success: true, data: value };
  }

  const error = Value.Errors(schema, value).First();
  return {
    success: false,
    errors: [
      contractError(
        "INVALID_DOCUMENT",
        error?.path || "/",
        "Document does not match the Velvet contract.",
      ),
    ],
  };
}
