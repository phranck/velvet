import type { Static } from "@sinclair/typebox";

import { StatusDocumentSchema } from "../schemas.js";
import {
  contractError,
  inspectDate,
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

  const errors = [
    ...inspectTimestamp(value.generatedAt, "/generatedAt"),
    ...inspectTimestamp(value.monitoringStartedAt, "/monitoringStartedAt"),
  ];
  if (!Array.isArray(value.services)) {
    return errors;
  }

  const serviceIds = new Set<string>();
  value.services.forEach((service, serviceIndex) => {
    if (!isRecord(service)) {
      return;
    }

    if (typeof service.id === "string") {
      if (serviceIds.has(service.id)) {
        errors.push(
          contractError(
            "DUPLICATE_SERVICE_ID",
            `/services/${serviceIndex}/id`,
            `Service identifier "${service.id}" is duplicated.`,
          ),
        );
      }
      serviceIds.add(service.id);
    }

    const checkIds = new Set<string>();
    if (Array.isArray(service.checks)) {
      service.checks.forEach((check, checkIndex) => {
        if (!isRecord(check)) {
          return;
        }

        if (typeof check.id === "string") {
          if (checkIds.has(check.id)) {
            errors.push(
              contractError(
                "DUPLICATE_CHECK_ID",
                `/services/${serviceIndex}/checks/${checkIndex}/id`,
                `Check identifier "${check.id}" is duplicated within the service.`,
              ),
            );
          }
          checkIds.add(check.id);
        }

        if (
          typeof check.protocol === "string" &&
          check.protocol !== "ipv4" &&
          check.protocol !== "ipv6"
        ) {
          errors.push(
            contractError(
              "INVALID_PROTOCOL",
              `/services/${serviceIndex}/checks/${checkIndex}/protocol`,
              'Protocol must be either "ipv4" or "ipv6".',
            ),
          );
        }

        errors.push(
          ...inspectTimestamp(
            check.checkedAt,
            `/services/${serviceIndex}/checks/${checkIndex}/checkedAt`,
          ),
        );
      });
    }

    if (Array.isArray(service.dailyAvailability)) {
      service.dailyAvailability.forEach((day, dayIndex) => {
        if (!isRecord(day)) {
          return;
        }

        for (const field of ["monitoredSeconds", "unavailableSeconds"] as const) {
          if (typeof day[field] === "number" && day[field] < 0) {
            errors.push(
              contractError(
                "NEGATIVE_DURATION",
                `/services/${serviceIndex}/dailyAvailability/${dayIndex}/${field}`,
                "Duration must not be negative.",
              ),
            );
          }
        }

        errors.push(
          ...inspectDate(
            day.date,
            `/services/${serviceIndex}/dailyAvailability/${dayIndex}/date`,
          ),
        );
      });
    }
  });

  return errors;
}

function inspectRelations(
  document: Static<typeof StatusDocumentSchema>,
): ContractValidationError[] {
  const errors: ContractValidationError[] = [];
  const generatedAt = Date.parse(document.generatedAt);
  const monitoringStartedAt = Date.parse(document.monitoringStartedAt);

  if (monitoringStartedAt > generatedAt) {
    errors.push(
      contractError(
        "TIMESTAMP_OUT_OF_RANGE",
        "/monitoringStartedAt",
        "Monitoring cannot start after the document was generated.",
      ),
    );
  }

  const firstMonitoringDate = document.monitoringStartedAt.slice(0, 10);
  const generatedDate = document.generatedAt.slice(0, 10);
  document.services.forEach((service, serviceIndex) => {
    service.checks.forEach((check, checkIndex) => {
      if (check.checkedAt === null) {
        return;
      }

      const checkedAt = Date.parse(check.checkedAt);
      if (checkedAt < monitoringStartedAt || checkedAt > generatedAt) {
        errors.push(
          contractError(
            "TIMESTAMP_OUT_OF_RANGE",
            `/services/${serviceIndex}/checks/${checkIndex}/checkedAt`,
            "Check timestamp must be within the monitoring period.",
          ),
        );
      }
    });

    service.dailyAvailability.forEach((day, dayIndex) => {
      if (day.date < firstMonitoringDate || day.date > generatedDate) {
        errors.push(
          contractError(
            "TIMESTAMP_OUT_OF_RANGE",
            `/services/${serviceIndex}/dailyAvailability/${dayIndex}/date`,
            "Daily availability must be within the monitoring period.",
          ),
        );
      }

      if (day.unavailableSeconds > day.monitoredSeconds) {
        errors.push(
          contractError(
            "INVALID_DURATION_RANGE",
            `/services/${serviceIndex}/dailyAvailability/${dayIndex}/unavailableSeconds`,
            "Unavailable time cannot exceed monitored time.",
          ),
        );
      }
    });
  });

  return errors;
}

export function validateStatusDocument(
  value: unknown,
): ContractValidationResult<Static<typeof StatusDocumentSchema>> {
  const errors = [...inspectSchemaVersion(value), ...inspectDocument(value)];
  if (errors.length > 0) {
    return { success: false, errors };
  }

  const result = validateSchema(StatusDocumentSchema, value);
  if (!result.success) {
    return result;
  }

  const relationErrors = inspectRelations(result.data);
  return relationErrors.length > 0
    ? { success: false, errors: relationErrors }
    : result;
}
