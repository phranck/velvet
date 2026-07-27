import type { Static } from "@sinclair/typebox";

import { IncidentsDocumentSchema } from "../schemas.js";
import {
  contractError,
  inspectSchemaVersion,
  inspectTimestamp,
  isRecord,
  validateSchema,
} from "./shared.js";
import type {
  ContractValidationError,
  ContractValidationResult,
} from "./types.js";

function inspectDocument(value: unknown): ContractValidationError[] {
  if (!isRecord(value)) {
    return [];
  }

  const errors = [...inspectTimestamp(value.generatedAt, "/generatedAt")];
  if (!Array.isArray(value.events)) {
    return errors;
  }

  const eventIds = new Set<string>();
  value.events.forEach((event, eventIndex) => {
    if (!isRecord(event)) {
      return;
    }

    if (typeof event.id === "string") {
      if (eventIds.has(event.id)) {
        errors.push(
          contractError(
            "DUPLICATE_EVENT_ID",
            `/events/${eventIndex}/id`,
            `Event identifier "${event.id}" is duplicated.`,
          ),
        );
      }
      eventIds.add(event.id);
    }

    errors.push(
      ...inspectTimestamp(event.startsAt, `/events/${eventIndex}/startsAt`),
      ...inspectTimestamp(event.endsAt, `/events/${eventIndex}/endsAt`),
    );
  });

  return errors;
}

function inspectRelations(
  document: Static<typeof IncidentsDocumentSchema>,
): ContractValidationError[] {
  const errors: ContractValidationError[] = [];
  const generatedAt = Date.parse(document.generatedAt);

  document.events.forEach((event, eventIndex) => {
    const startsAt = Date.parse(event.startsAt);
    const endsAt = event.endsAt === null ? null : Date.parse(event.endsAt);

    if (event.kind === "incident") {
      if (
        (event.state === "open" && endsAt !== null) ||
        (event.state === "resolved" && endsAt === null)
      ) {
        errors.push(
          contractError(
            "INVALID_EVENT_STATE",
            `/events/${eventIndex}/endsAt`,
            "Incident state and end timestamp are inconsistent.",
          ),
        );
      }

      if (startsAt > generatedAt || (endsAt !== null && endsAt > generatedAt)) {
        errors.push(
          contractError(
            "TIMESTAMP_OUT_OF_RANGE",
            `/events/${eventIndex}/${startsAt > generatedAt ? "startsAt" : "endsAt"}`,
            "Incident timestamps cannot be later than document generation.",
          ),
        );
      }
    }

    if (endsAt !== null && endsAt < startsAt) {
      errors.push(
        contractError(
          "TIMESTAMP_OUT_OF_RANGE",
          `/events/${eventIndex}/endsAt`,
          "An event cannot end before it starts.",
        ),
      );
    }
  });

  return errors;
}

export function validateIncidentsDocument(
  value: unknown,
): ContractValidationResult<Static<typeof IncidentsDocumentSchema>> {
  const errors = [...inspectSchemaVersion(value), ...inspectDocument(value)];
  if (errors.length > 0) {
    return { success: false, errors };
  }

  const result = validateSchema(IncidentsDocumentSchema, value);
  if (!result.success) {
    return result;
  }

  const relationErrors = inspectRelations(result.data);
  return relationErrors.length > 0
    ? { success: false, errors: relationErrors }
    : result;
}
