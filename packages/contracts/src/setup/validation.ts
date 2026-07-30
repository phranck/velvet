import { Value } from "@sinclair/typebox/value";

import { validateVelvetConfiguration } from "../configuration/validation.js";
import {
  SetupEventSchema,
  SetupRequestSchema,
  SetupSessionSchema,
  SetupStatusSchema,
  type SetupEvent,
  type SetupSession,
  type SetupStatus,
} from "./schemas.js";
import type {
  SetupContractValidationResult,
  SetupRequest,
} from "./types.js";

export function validateSetupRequest(
  value: unknown,
): SetupContractValidationResult<SetupRequest> {
  if (!Value.Check(SetupRequestSchema, value)) {
    const error = Value.Errors(SetupRequestSchema, value).First();
    return {
      success: false,
      errors: [
        {
          code: "INVALID_SETUP_REQUEST",
          path: error?.path || "/",
          message: "Setup request does not match the supported contract.",
        },
      ],
    };
  }

  const configuration = validateVelvetConfiguration(value.configuration);
  if (!configuration.success) {
    return {
      success: false,
      errors: configuration.errors.map((error) => ({
        code: "INVALID_SETUP_REQUEST" as const,
        path: `/configuration${error.path === "/" ? "" : error.path}`,
        message: error.message,
      })),
    };
  }
  return { success: true, data: { configuration: configuration.data } };
}

export const validateSetupEvent = (
  value: unknown,
): SetupContractValidationResult<SetupEvent> =>
  validatePublicContract(SetupEventSchema, value);

export const validateSetupSession = (
  value: unknown,
): SetupContractValidationResult<SetupSession> =>
  validatePublicContract(SetupSessionSchema, value);

export const validateSetupStatus = (
  value: unknown,
): SetupContractValidationResult<SetupStatus> =>
  validatePublicContract(SetupStatusSchema, value);

function validatePublicContract<T>(
  schema: Parameters<typeof Value.Check>[0],
  value: unknown,
): SetupContractValidationResult<T> {
  if (Value.Check(schema, value)) {
    return { success: true, data: value as T };
  }
  const error = Value.Errors(schema, value).First();
  return {
    success: false,
    errors: [
      {
        code: "INVALID_SETUP_CONTRACT",
        path: error?.path || "/",
        message: "Setup response does not match the supported contract.",
      },
    ],
  };
}
