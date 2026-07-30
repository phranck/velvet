import {
  normalizeCustomDomain,
  validateVelvetConfiguration,
  type NormalizedVelvetConfiguration,
  type SetupProgressStage as ContractSetupProgressStage,
  type VelvetConfigurationInput,
} from "@velvet/contracts";

import {
  createServiceDraft,
  type AssertionValueType,
  type ServiceDraft,
} from "../components/service-editor/model.js";
import { isCuratedServiceIcon } from "../lib/icons.js";
import {
  SYSTEM_THEMES,
  canonicalSystemTheme,
  systemThemeById,
} from "./system-themes.js";

export {
  createHeaderDraft,
  createJsonAssertionDraft,
  createServiceDraft,
  type AssertionValueType,
  type HeaderDraft,
  type JsonAssertionDraft,
  type ServiceDraft,
} from "../components/service-editor/model.js";

export interface OnboardingDraft {
  repositoryOwner: string;
  repositoryName: string;
  statusPageName: string;
  customDomain: string;
  themeId: string;
  services: ServiceDraft[];
}

export interface SetupRequest {
  configuration: NormalizedVelvetConfiguration;
}

export type OnboardingValidationResult =
  | { success: true; request: SetupRequest }
  | { success: false; errors: Record<string, string> };

export type SetupProgressStage = ContractSetupProgressStage;

export interface SetupClient {
  provision(
    request: SetupRequest,
    onProgress?: (stage: SetupProgressStage) => void,
  ): Promise<{ installationUrl: string }>;
}

export interface SetupFailure {
  message: string;
  errorId: string;
  recoverable: boolean;
  repositoryUrl?: string;
  workflowUrl?: string;
}

export class SetupClientError extends Error {
  readonly failure: SetupFailure;

  constructor(failure: SetupFailure) {
    super("SETUP_FAILED");
    this.name = "SetupClientError";
    this.failure = failure;
  }
}

export type SetupSubmissionResult =
  | { state: "invalid"; errors: Record<string, string> }
  | { state: "permission-required"; message: string }
  | ({ state: "failed" } & SetupFailure)
  | { state: "success"; installationUrl: string };

export function createOnboardingDraft(): OnboardingDraft {
  return {
    repositoryOwner: "",
    repositoryName: "status",
    statusPageName: "Status",
    customDomain: "",
    themeId: SYSTEM_THEMES[0].id,
    services: [createServiceDraft()],
  };
}

export function buildSetupRequest(
  draft: OnboardingDraft,
): OnboardingValidationResult {
  const errors: Record<string, string> = {};
  const theme = systemThemeById(draft.themeId);
  if (!theme) errors.themeId = "Choose one of the available system themes.";
  const customDomain = draft.customDomain.trim()
    ? normalizeCustomDomain(draft.customDomain)
    : null;
  if (draft.customDomain.trim() && !customDomain) {
    errors.customDomain =
      "Enter a hostname without https://, a path, port, credentials, or wildcard.";
  }

  const services = draft.services.map((service, index) => {
    if (service.icon !== null && !isCuratedServiceIcon(service.icon)) {
      errors[`services.${index}.icon`] = "Choose an icon from the available set.";
    }
    if (!service.advanced) {
      return { name: service.name.trim(), url: service.url.trim() };
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
      .filter(({ path, value, valueType }) =>
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

    return {
      name: service.name.trim(),
      checks: [
        {
          name: service.name.trim(),
          url: service.url.trim(),
          method: service.method,
          expectedStatusCodes,
          maxRedirects: service.maxRedirects,
          timeoutMs: service.timeoutMs,
          headers,
          jsonAssertions,
        },
      ],
    };
  });

  if (draft.services.length === 0) {
    errors.services = "Add at least one service.";
  }
  if (Object.keys(errors).length > 0 || !theme) {
    return { success: false, errors };
  }

  const baseInput: VelvetConfigurationInput = {
    schemaVersion: 1,
    repository: {
      owner: draft.repositoryOwner.trim(),
      name: draft.repositoryName.trim(),
    },
    statusPage: {
      name: draft.statusPageName.trim(),
      theme: canonicalSystemTheme(theme),
      ...(customDomain ? { customDomain } : {}),
    },
    services,
    history: { retentionDays: 365 },
  };
  const baseResult = validateVelvetConfiguration(baseInput);
  if (!baseResult.success) {
    return { success: false, errors: mapContractErrors(baseResult.errors) };
  }

  const icons = Object.fromEntries(
    baseResult.data.services.flatMap((service, index) => {
      const icon = draft.services[index].icon;
      return icon ? [[service.id, icon]] : [];
    }),
  );
  const finalResult = validateVelvetConfiguration({
    ...baseInput,
    statusPage: { ...baseInput.statusPage, icons },
  });
  if (!finalResult.success) {
    return { success: false, errors: mapContractErrors(finalResult.errors) };
  }
  return { success: true, request: { configuration: finalResult.data } };
}

export async function submitOnboarding(
  draft: OnboardingDraft,
  client: SetupClient,
  onProgress?: (stage: SetupProgressStage) => void,
): Promise<SetupSubmissionResult> {
  const validation = buildSetupRequest(draft);
  if (!validation.success) {
    return { state: "invalid", errors: validation.errors };
  }

  try {
    const result = await client.provision(validation.request, onProgress);
    return { state: "success", installationUrl: result.installationUrl };
  } catch (error) {
    if (error instanceof SetupClientError) {
      return { state: "failed", ...error.failure };
    }
    const message = error instanceof Error ? error.message : "SETUP_FAILED";
    if (
      message === "SETUP_PERMISSION_REQUIRED" ||
      message === "SETUP_REDIRECT_STARTED"
    ) {
      return {
        state: "permission-required",
        message: "Continue with GitHub to grant the required permission.",
      };
    }
    return {
      state: "failed",
      message: "Setup could not finish. Your entries are still here, so you can retry.",
      errorId: "",
      recoverable: true,
    };
  }
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
    entries.some((value) => !Number.isInteger(value) || value < 100 || value > 599)
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

function mapContractErrors(
  contractErrors: readonly { path: string; message: string }[],
): Record<string, string> {
  return Object.fromEntries(
    contractErrors.map(({ path, message }) => [fieldPath(path), message]),
  );
}

function fieldPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "repository" && parts[1] === "owner") {
    return "repositoryOwner";
  }
  if (parts[0] === "repository" && parts[1] === "name") {
    return "repositoryName";
  }
  if (parts[0] === "statusPage" && parts[1] === "name") {
    return "statusPageName";
  }
  if (parts[0] === "statusPage" && parts[1] === "customDomain") {
    return "customDomain";
  }
  if (parts[0] === "services" && parts[1]) {
    if (parts.includes("url")) return `services.${parts[1]}.url`;
    if (parts.includes("expectedStatusCodes")) {
      return `services.${parts[1]}.expectedStatusCodes`;
    }
    if (parts.includes("maxRedirects")) return `services.${parts[1]}.maxRedirects`;
    if (parts.includes("timeoutMs")) return `services.${parts[1]}.timeoutMs`;
    if (parts.includes("headers") || parts.includes("jsonAssertions")) {
      return `services.${parts[1]}.advanced`;
    }
    return `services.${parts[1]}.name`;
  }
  return path === "/" ? "form" : parts.join(".");
}
