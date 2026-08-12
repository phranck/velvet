import {
  MAX_SETUP_LOGO_BASE64_BYTES,
  type SetupLogo,
} from "@velvet/contracts";

import { DESIGNS } from "../lib/designs.js";
import type {
  AssertionValueType,
  OnboardingDraft,
  ServiceDraft,
} from "./state.js";

export const ONBOARDING_SESSION_STORAGE_KEY = "velvet.onboarding.session.v1";

/**
 * The most a stored draft may weigh.
 *
 * A draft over this is not stored at all, and silently, so it has to clear the
 * largest logo the field accepts with room left for the configuration around
 * it. Derived from the logo bound for that reason rather than stated as a round
 * number that would stop covering it the moment the logo bound moved.
 */
const MAX_STORED_BYTES = MAX_SETUP_LOGO_BASE64_BYTES + 64 * 1_024;

/** What a logo may be, matching the four the page build knows to copy. */
const LOGO_TYPES: readonly SetupLogo["type"][] = [
  "image/svg+xml",
  "image/png",
  "image/webp",
  "image/jpeg",
];

export interface OnboardingSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function persistOnboardingDraft(
  draft: OnboardingDraft,
  storage: OnboardingSessionStorage | null | undefined,
): boolean {
  if (!storage) return false;
  try {
    const source = JSON.stringify({ version: 1, draft });
    if (source.length > MAX_STORED_BYTES) return false;
    storage.setItem(ONBOARDING_SESSION_STORAGE_KEY, source);
    return true;
  } catch {
    return false;
  }
}

export function loadOnboardingDraft(
  storage: OnboardingSessionStorage | null | undefined,
): OnboardingDraft | null {
  if (!storage) return null;
  let source: string | null;
  try {
    source = storage.getItem(ONBOARDING_SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!source) return null;
  try {
    if (source.length > MAX_STORED_BYTES) {
      throw new Error("Stored setup is too large.");
    }
    const stored: unknown = JSON.parse(source);
    if (!isRecord(stored) || stored.version !== 1) {
      throw new Error("Unsupported setup session.");
    }
    return parseDraft(stored.draft);
  } catch {
    clearOnboardingDraft(storage);
    return null;
  }
}

export function clearOnboardingDraft(
  storage: OnboardingSessionStorage | null | undefined,
): void {
  if (!storage) return;
  try {
    storage.removeItem(ONBOARDING_SESSION_STORAGE_KEY);
  } catch {
    // Setup remains usable when session storage is unavailable.
  }
}

function parseDraft(value: unknown): OnboardingDraft {
  if (
    !isRecord(value) ||
    typeof value.repositoryOwner !== "string" ||
    typeof value.repositoryName !== "string" ||
    typeof value.statusPageName !== "string" ||
    (value.customDomain !== undefined && typeof value.customDomain !== "string") ||
    // Absent in a session stored before the field existed, which is why it is
    // tolerated rather than required. Rejecting it would throw away a draft
    // somebody had already filled in.
    (value.description !== undefined && typeof value.description !== "string") ||
    (value.listInGallery !== undefined &&
      typeof value.listInGallery !== "boolean") ||
    (value.privateRepository !== undefined &&
      typeof value.privateRepository !== "boolean") ||
    // Absent in a session stored whilst the step still offered palettes, and
    // tolerated for the same reason as the fields above: a draft somebody has
    // filled in is not worth discarding over the one answer that has moved.
    (value.designId !== undefined && typeof value.designId !== "string") ||
    !Array.isArray(value.services) ||
    value.services.length === 0
  ) {
    throw new Error("Invalid setup session.");
  }
  const logo = parseLogo(value.logo);
  return {
    repositoryOwner: value.repositoryOwner,
    repositoryName: value.repositoryName,
    statusPageName: value.statusPageName,
    customDomain: value.customDomain ?? "",
    description: value.description ?? "",
    // A session stored before this question existed answers it with a no,
    // which is the same thing an untouched box says.
    listInGallery: value.listInGallery ?? false,
    // A session stored before the question existed keeps what those
    // installations received, which was a public repository.
    privateRepository: value.privateRepository ?? false,
    designId: value.designId ?? DESIGNS[0].id,
    services: value.services.map(parseService),
    // Setup leaves the page for GitHub and returns to a fresh load, so a logo
    // that did not survive this is a logo the request never carries.
    ...(logo ? { logo } : {}),
  };
}

/**
 * Reads a stored logo back, or nothing when it is not one Velvet can write.
 *
 * A logo that cannot be used is dropped on its own rather than by rejecting the
 * session, because everything else somebody filled in is still worth keeping
 * and a missing logo is visible to them whilst a lost draft is not.
 *
 * @param value - The `logo` field as it came out of storage.
 * @returns The logo, or `undefined` when there is none to restore.
 */
function parseLogo(value: unknown): SetupLogo | undefined {
  if (!isRecord(value)) return undefined;
  const { type, content } = value;
  if (typeof content !== "string" || content === "") return undefined;
  if (!LOGO_TYPES.includes(type as SetupLogo["type"])) return undefined;
  return { type: type as SetupLogo["type"], content };
}

function parseService(value: unknown): ServiceDraft {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.url !== "string" ||
    (value.icon !== null && typeof value.icon !== "string") ||
    typeof value.advanced !== "boolean" ||
    (value.method !== "GET" && value.method !== "HEAD") ||
    typeof value.expectedStatusCodes !== "string" ||
    !finiteNumber(value.maxRedirects) ||
    !finiteNumber(value.timeoutMs) ||
    !Array.isArray(value.headers) ||
    !Array.isArray(value.jsonAssertions)
  ) {
    throw new Error("Invalid service session.");
  }
  return {
    id: value.id,
    name: value.name,
    url: value.url,
    icon: value.icon,
    advanced: value.advanced,
    method: value.method,
    expectedStatusCodes: value.expectedStatusCodes,
    maxRedirects: value.maxRedirects,
    timeoutMs: value.timeoutMs,
    headers: value.headers.map((header) => {
      if (
        !isRecord(header) ||
        typeof header.id !== "string" ||
        typeof header.name !== "string" ||
        typeof header.secret !== "string"
      ) {
        throw new Error("Invalid header session.");
      }
      return { id: header.id, name: header.name, secret: header.secret };
    }),
    jsonAssertions: value.jsonAssertions.map((assertion) => {
      if (
        !isRecord(assertion) ||
        typeof assertion.id !== "string" ||
        typeof assertion.path !== "string" ||
        !assertionValueType(assertion.valueType) ||
        typeof assertion.value !== "string"
      ) {
        throw new Error("Invalid JSON assertion session.");
      }
      return {
        id: assertion.id,
        path: assertion.path,
        valueType: assertion.valueType,
        value: assertion.value,
      };
    }),
  };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertionValueType(value: unknown): value is AssertionValueType {
  return (
    value === "string" ||
    value === "number" ||
    value === "boolean" ||
    value === "null"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
