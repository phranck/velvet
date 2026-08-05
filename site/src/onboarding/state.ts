import {
  normalizeCustomDomain,
  validateVelvetConfiguration,
  type NormalizedVelvetConfiguration,
  type SetupErrorCode,
  type SetupLogo,
  type SetupProgressStage as ContractSetupProgressStage,
  type VelvetConfigurationInput,
} from "@velvet/contracts";

import {
  createServiceDraft,
  type ServiceDraft,
} from "../components/service-editor/model.js";
import { validateServiceDrafts } from "../components/service-editor/validation.js";
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
  /**
   * One sentence about the page, or empty.
   *
   * Optional, and stored as the configuration's SEO description rather than as
   * a field of its own, because what somebody writes about their page is
   * exactly what a search engine and a shared link should show.
   */
  description: string;
  customDomain: string;
  themeId: string;
  services: ServiceDraft[];
  /**
   * Whether this installation may be named as a reference on velvet.li.
   *
   * Starts off, and only the visitor's own tick turns it on. A public
   * repository is easy to mistake for agreement, but publishing something and
   * agreeing to be advertised with it are different decisions, and only the
   * owner makes the second one.
   */
  listInGallery: boolean;
  /**
   * Whether GitHub should create the repository private.
   *
   * Off by default, and deliberately so. Publishing GitHub Pages from a private
   * repository needs a paid plan, so a default of private would hand anybody on
   * a free account a repository that works and a status page that never
   * appears. A setting that depends on something Velvet cannot check is one the
   * reader has to choose rather than one they have to notice and undo.
   */
  privateRepository: boolean;
  /**
   * A logo for the status page's header, as the visitor chose it.
   *
   * Kept out of session storage with the rest of the draft, because a restored
   * draft would otherwise carry a file somebody picked an hour ago and no
   * longer has in front of them. Absent means the page shows its name.
   */
  logo?: SetupLogo;
}

export interface SetupRequest {
  configuration: NormalizedVelvetConfiguration;
  repositoryVisibility: "public" | "private";
  /** The chosen logo, written into the new repository and served from it. */
  logo?: SetupLogo;
  /**
   * Permission to delete a repository of that name that already exists.
   *
   * Absent unless somebody has just been shown the name and has said to
   * replace it. It is deliberately not part of the draft: the draft is kept in
   * session storage and restored on a later visit, and an answer to a question
   * asked once must not still be granting a deletion an hour afterwards.
   */
  replaceExistingRepository?: boolean;
}

export type OnboardingValidationResult =
  | { success: true; request: SetupRequest }
  | { success: false; errors: Record<string, string> };

export type SetupProgressStage = ContractSetupProgressStage;

export interface SetupClient {
  provision(
    request: SetupRequest,
    onProgress?: (stage: SetupProgressStage) => void,
  ): Promise<{ installationUrl: string; serial?: number }>;
}

export interface SetupFailure {
  message: string;
  errorId: string;
  recoverable: boolean;
  /**
   * What the service called the failure, when it said.
   *
   * Carried through so a failure the visitor can answer is told apart from one
   * they can only read. Optional, because a failure that never reached the
   * service has no code to carry.
   */
  code?: SetupErrorCode;
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
  | { state: "success"; installationUrl: string; serial?: number };

export function createOnboardingDraft(): OnboardingDraft {
  return {
    repositoryOwner: "",
    repositoryName: "status",
    statusPageName: "Status",
    description: "",
    customDomain: "",
    themeId: SYSTEM_THEMES[0].id,
    services: [createServiceDraft()],
    listInGallery: false,
    privateRepository: false,
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
  const description = draft.description.trim();
  if (draft.customDomain.trim() && !customDomain) {
    errors.customDomain =
      "Enter a hostname without https://, a path, port, credentials, or wildcard.";
  }

  const serviceValidation = validateServiceDrafts(draft.services);
  if (!serviceValidation.success) {
    Object.assign(errors, serviceValidation.errors);
  }
  if (
    Object.keys(errors).length > 0 ||
    !theme ||
    !serviceValidation.success
  ) {
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
      // Omitted entirely when blank. The contract caps the description at 300
      // characters and rejects an empty string, so writing one would fail the
      // whole configuration over a field nobody filled in.
      ...(description ? { seo: { description } } : {}),
    },
    services: serviceValidation.services,
    history: { retentionDays: 365 },
    gallery: { listed: draft.listInGallery },
  };
  const finalResult = validateVelvetConfiguration({
    ...baseInput,
    statusPage: {
      ...baseInput.statusPage,
      icons: serviceValidation.icons,
    },
  });
  if (!finalResult.success) {
    return { success: false, errors: mapContractErrors(finalResult.errors) };
  }
  return {
    success: true,
    request: {
      configuration: finalResult.data,
      repositoryVisibility: draft.privateRepository ? "private" : "public",
      ...(draft.logo ? { logo: draft.logo } : {}),
    },
  };
}

/**
 * Checks everything the Basics step collects, so a wrong entry stops the
 * visitor at the field that holds it.
 *
 * The custom domain is read out of a full `buildSetupRequest` rather than
 * checked again here, because that keeps its rule and its wording in one
 * place. Every other error the build reports belongs to a later step and is
 * dropped.
 *
 * @param draft - The onboarding draft as it currently stands.
 * @returns Field keys mapped to messages, empty when the step may be left.
 */
export function validateBasicsStep(
  draft: OnboardingDraft,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.repositoryOwner.trim()) {
    errors.repositoryOwner = "Enter your GitHub name.";
  }
  if (!draft.repositoryName.trim()) {
    errors.repositoryName = "Enter a repository name.";
  }
  if (!draft.statusPageName.trim()) {
    errors.statusPageName = "Enter a status page name.";
  }
  const validation = buildSetupRequest(draft);
  if (!validation.success && validation.errors.customDomain) {
    errors.customDomain = validation.errors.customDomain;
  }
  return errors;
}

/**
 * Checks every service the visitor has entered, so a malformed URL is rejected
 * beside its own field instead of on the Publish step.
 *
 * The two emptiness checks run first and win, because "Enter a URL to monitor."
 * reads better on an untouched field than the contract's description of what a
 * URL has to be. Everything beyond emptiness comes from the contract itself
 * through `validateServiceDrafts`, so this step and the final submission can
 * never disagree about what counts as valid.
 *
 * @param draft - The onboarding draft as it currently stands.
 * @returns Field keys mapped to messages, empty when the step may be left.
 */
export function validateServicesStep(
  draft: OnboardingDraft,
): Record<string, string> {
  const errors: Record<string, string> = {};
  draft.services.forEach((service, index) => {
    if (!service.name.trim()) {
      errors[`services.${index}.name`] = "Enter a service name.";
    }
    if (!service.url.trim()) {
      errors[`services.${index}.url`] = "Enter a URL to monitor.";
    }
  });

  const validation = validateServiceDrafts(draft.services);
  if (!validation.success) {
    for (const [field, message] of Object.entries(validation.errors)) {
      errors[field] ??= message;
    }
  }
  return errors;
}

/**
 * Builds the request, sends it, and turns whatever comes back into one of the
 * four outcomes the interface knows how to show.
 *
 * @param draft - The onboarding draft as it currently stands.
 * @param client - The setup client to submit through.
 * @param onProgress - Called as the service reports each stage.
 * @param options - Answers to questions an earlier attempt asked. Currently
 *   only `replaceExistingRepository`, which is set once, for one submission,
 *   after somebody has agreed to a named repository being deleted.
 * @returns What happened, with the field errors or the failure attached.
 */
export async function submitOnboarding(
  draft: OnboardingDraft,
  client: SetupClient,
  onProgress?: (stage: SetupProgressStage) => void,
  options: { replaceExistingRepository?: boolean } = {},
): Promise<SetupSubmissionResult> {
  const validation = buildSetupRequest(draft);
  if (!validation.success) {
    return { state: "invalid", errors: validation.errors };
  }

  try {
    const result = await client.provision(
      {
        ...validation.request,
        ...(options.replaceExistingRepository
          ? { replaceExistingRepository: true }
          : {}),
      },
      onProgress,
    );
    return {
      state: "success",
      installationUrl: result.installationUrl,
      ...(typeof result.serial === "number" ? { serial: result.serial } : {}),
    };
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
