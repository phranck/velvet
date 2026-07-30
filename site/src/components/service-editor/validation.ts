import {
  validateVelvetConfiguration,
  type NormalizedHttpCheck,
  type NormalizedService,
  type VelvetConfigurationInput,
} from "@velvet/contracts";

import { isCuratedServiceIcon } from "../../lib/icons.js";
import type {
  AssertionValueType,
  ServiceDraft,
} from "./model.js";

export interface ServiceDraftContractMetadata {
  serviceId?: string | null;
  checkId?: string | null;
  checkName?: string | null;
  additionalChecks?: NormalizedHttpCheck[];
}

export type ContractServiceDraft = ServiceDraft & ServiceDraftContractMetadata;

export type ServiceDraftValidationResult =
  | {
      success: true;
      services: NormalizedService[];
      icons: Record<string, string>;
    }
  | { success: false; errors: Record<string, string> };

export function validateServiceDrafts(
  drafts: readonly ContractServiceDraft[],
): ServiceDraftValidationResult {
  const errors: Record<string, string> = {};
  if (drafts.length === 0) errors.services = "Add at least one service.";

  const services: VelvetConfigurationInput["services"] = drafts.map(
    (service, index) => {
      if (service.icon !== null && !isCuratedServiceIcon(service.icon)) {
        errors[`services.${index}.icon`] =
          "Choose an icon from the available set.";
      }

      const expectedStatusCodes = parseStatusCodes(
        service.expectedStatusCodes,
        `services.${index}.expectedStatusCodes`,
        errors,
      );
      const headers = service.headers
        .filter(({ name, secret }) => name.trim() || secret.trim())
        .map(({ name, secret }) => ({
          name: name.trim(),
          secret: secret.trim(),
        }));
      const jsonAssertions = service.jsonAssertions
        .filter(
          ({ path, value, valueType }) =>
            path.trim() || value.trim() || valueType === "null",
        )
        .map(({ path, value, valueType }, assertionIndex) => ({
          path: path.trim(),
          equals: parseAssertionValue(
            value,
            valueType,
            `services.${index}.jsonAssertions.${assertionIndex}.value`,
            errors,
          ),
        }));
      const name = service.name.trim();
      const primaryCheck = {
        ...(service.checkId ? { id: service.checkId } : {}),
        name: service.checkName?.trim() || name,
        url: service.url.trim(),
        method: service.method,
        expectedStatusCodes,
        maxRedirects: service.maxRedirects,
        timeoutMs: service.timeoutMs,
        headers,
        jsonAssertions,
      };

      return {
        ...(service.serviceId ? { id: service.serviceId } : {}),
        name,
        checks: [primaryCheck, ...(service.additionalChecks ?? [])],
      };
    },
  );

  if (Object.keys(errors).length > 0) return { success: false, errors };

  const validation = validateVelvetConfiguration({
    schemaVersion: 1,
    repository: { owner: "velvet-user", name: "status" },
    statusPage: { name: "Status" },
    services,
  });
  if (!validation.success) {
    return { success: false, errors: mapServiceErrors(validation.errors) };
  }

  const icons = Object.fromEntries(
    validation.data.services.flatMap((service, index) => {
      const icon = drafts[index]?.icon;
      return icon ? [[service.id, icon]] : [];
    }),
  );
  return { success: true, services: validation.data.services, icons };
}

function parseStatusCodes(
  source: string,
  path: string,
  errors: Record<string, string>,
): number[] {
  const entries = source
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (
    entries.length === 0 ||
    entries.some(
      (value) => !Number.isInteger(value) || value < 100 || value > 599,
    )
  ) {
    errors[path] = "Enter HTTP status codes from 100 through 599.";
  }
  return entries;
}

function parseAssertionValue(
  value: string,
  type: AssertionValueType,
  path: string,
  errors: Record<string, string>,
): string | number | boolean | null {
  if (type === "null") return null;
  if (type === "boolean") {
    if (value !== "true" && value !== "false") {
      errors[path] = "Enter true or false.";
    }
    return value === "true";
  }
  if (type === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || value.trim() === "") {
      errors[path] = "Enter a valid number.";
    }
    return parsed;
  }
  return value;
}

function mapServiceErrors(
  contractErrors: readonly { path: string; message: string }[],
): Record<string, string> {
  return Object.fromEntries(
    contractErrors.map(({ path, message }) => [serviceFieldPath(path), message]),
  );
}

function serviceFieldPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "services" || !parts[1]) {
    return path === "/" ? "form" : parts.join(".");
  }
  if (parts.includes("url")) return `services.${parts[1]}.url`;
  if (parts.includes("expectedStatusCodes")) {
    return `services.${parts[1]}.expectedStatusCodes`;
  }
  if (parts.includes("maxRedirects")) {
    return `services.${parts[1]}.maxRedirects`;
  }
  if (parts.includes("timeoutMs")) return `services.${parts[1]}.timeoutMs`;
  if (parts.includes("headers") || parts.includes("jsonAssertions")) {
    return `services.${parts[1]}.advanced`;
  }
  return `services.${parts[1]}.name`;
}
