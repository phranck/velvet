import type { Static } from "@sinclair/typebox";

import { ResponseTimesDocumentSchema } from "../schemas.js";
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

  const errors = [
    ...inspectTimestamp(value.generatedAt, "/generatedAt"),
    ...inspectTimestamp(value.monitoringStartedAt, "/monitoringStartedAt"),
  ];
  if (!Array.isArray(value.series)) {
    return errors;
  }

  const seriesIds = new Set<string>();
  value.series.forEach((series, seriesIndex) => {
    if (!isRecord(series)) {
      return;
    }

    if (typeof series.serviceId === "string" && typeof series.checkId === "string") {
      const seriesId = `${series.serviceId}\u0000${series.checkId}`;
      if (seriesIds.has(seriesId)) {
        errors.push(
          contractError(
            "DUPLICATE_RESPONSE_SERIES",
            `/series/${seriesIndex}`,
            "A response-time series for this service and check already exists.",
          ),
        );
      }
      seriesIds.add(seriesId);
    }

    if (
      typeof series.protocol === "string" &&
      series.protocol !== "ipv4" &&
      series.protocol !== "ipv6"
    ) {
      errors.push(
        contractError(
          "INVALID_PROTOCOL",
          `/series/${seriesIndex}/protocol`,
          'Protocol must be either "ipv4" or "ipv6".',
        ),
      );
    }

    if (!Array.isArray(series.samples)) {
      return;
    }

    const timestamps = new Set<string>();
    series.samples.forEach((sample, sampleIndex) => {
      if (!isRecord(sample)) {
        return;
      }

      errors.push(
        ...inspectTimestamp(
          sample.timestamp,
          `/series/${seriesIndex}/samples/${sampleIndex}/timestamp`,
        ),
      );
      if (typeof sample.timestamp === "string") {
        if (timestamps.has(sample.timestamp)) {
          errors.push(
            contractError(
              "DUPLICATE_SAMPLE_TIMESTAMP",
              `/series/${seriesIndex}/samples/${sampleIndex}/timestamp`,
              "A response-time sample with this timestamp already exists.",
            ),
          );
        }
        timestamps.add(sample.timestamp);
      }
    });
  });

  return errors;
}

function inspectRelations(
  document: Static<typeof ResponseTimesDocumentSchema>,
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

  document.series.forEach((series, seriesIndex) => {
    let previousTimestamp = monitoringStartedAt - 1;
    series.samples.forEach((sample, sampleIndex) => {
      const timestamp = Date.parse(sample.timestamp);
      if (
        timestamp < monitoringStartedAt ||
        timestamp > generatedAt ||
        timestamp <= previousTimestamp
      ) {
        errors.push(
          contractError(
            "TIMESTAMP_OUT_OF_RANGE",
            `/series/${seriesIndex}/samples/${sampleIndex}/timestamp`,
            "Response-time samples must be ordered within the monitoring period.",
          ),
        );
      }
      previousTimestamp = timestamp;
    });
  });

  return errors;
}

export function validateResponseTimesDocument(
  value: unknown,
): ContractValidationResult<Static<typeof ResponseTimesDocumentSchema>> {
  const errors = [...inspectSchemaVersion(value), ...inspectDocument(value)];
  if (errors.length > 0) {
    return { success: false, errors };
  }

  const result = validateSchema(ResponseTimesDocumentSchema, value);
  if (!result.success) {
    return result;
  }

  const relationErrors = inspectRelations(result.data);
  return relationErrors.length > 0
    ? { success: false, errors: relationErrors }
    : result;
}
