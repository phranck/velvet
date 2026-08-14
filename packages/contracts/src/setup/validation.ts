import { Value } from "@sinclair/typebox/value";

import { validateVelvetConfiguration } from "../configuration/validation.js";
import {
  NotifyRequestSchema,
  SetupEventSchema,
  SetupInstallationsSchema,
  SetupRequestSchema,
  SetupSessionSchema,
  SetupStatusSchema,
  type NotifyRequest,
  type SetupEvent,
  type SetupInstallations,
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
  // The configuration is rebuilt because validating it normalizes it. The rest
  // of the request is carried across field by field, so a field the request did
  // not state stays absent rather than arriving as undefined.
  return {
    success: true,
    data: {
      configuration: configuration.data,
      ...(value.repositoryVisibility === undefined
        ? {}
        : { repositoryVisibility: value.repositoryVisibility }),
      ...(value.replaceExistingRepository === undefined
        ? {}
        : { replaceExistingRepository: value.replaceExistingRepository }),
      ...(value.logo === undefined ? {} : { logo: value.logo }),
    },
  };
}

/**
 * Holds an alarm request to the contract before anything acts on it.
 *
 * Refused as a request rather than as a response, because this one arrives from
 * outside: a monitor run somewhere else sends it, so a field it did not state
 * or a field it invented is the caller's mistake and is answerable as such.
 *
 * @param value - The parsed body, still untrusted.
 * @returns The request, or the reason it does not match the contract.
 */
export function validateNotifyRequest(
  value: unknown,
): SetupContractValidationResult<NotifyRequest> {
  if (Value.Check(NotifyRequestSchema, value)) {
    return { success: true, data: value };
  }
  const error = Value.Errors(NotifyRequestSchema, value).First();
  return {
    success: false,
    errors: [
      {
        code: "INVALID_SETUP_REQUEST",
        path: error?.path || "/",
        message: "Alarm request does not match the supported contract.",
      },
    ],
  };
}

export const validateSetupEvent = (
  value: unknown,
): SetupContractValidationResult<SetupEvent> =>
  validatePublicContract(SetupEventSchema, value);

export const validateSetupInstallations = (
  value: unknown,
): SetupContractValidationResult<SetupInstallations> =>
  validatePublicContract(SetupInstallationsSchema, value);

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
