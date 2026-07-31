/**
 * Reads what the Velvet service offers for an installation.
 *
 * Kept separate from the setup client because the two have different
 * lifetimes: setup runs once and then never again, whilst update information
 * is read repeatedly for as long as an installation exists.
 */

/** What the service reports about the release it can install. */
export interface AvailableRelease {
  availableVersion: string;
  releaseType: "security" | "fix" | "feature";
  automaticInstallEligible: boolean;
  releaseNotes: string;
}

export type UpdateFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const RELEASE_TYPES = ["security", "fix", "feature"];

/**
 * Fetches the release the service can currently install.
 *
 * The response is validated rather than trusted, because it drives what a user
 * is told about their installation. A malformed body yields `null`, so the
 * interface shows nothing instead of showing something wrong.
 *
 * @param fetchImplementation - Injected for testing.
 * @returns The release, or `null` when unauthenticated or unusable.
 */
export async function readAvailableRelease(
  fetchImplementation: UpdateFetch = globalThis.fetch,
): Promise<AvailableRelease | null> {
  let response: Response;
  try {
    response = await fetchImplementation("/api/updates", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return null;
  }
  if (
    typeof body !== "object" ||
    body === null ||
    !("availableVersion" in body) ||
    !("releaseType" in body) ||
    !("automaticInstallEligible" in body) ||
    !("releaseNotes" in body)
  ) {
    return null;
  }
  const candidate = body as Record<string, unknown>;
  if (
    typeof candidate.availableVersion !== "string" ||
    !/^\d+\.\d+\.\d+/u.test(candidate.availableVersion) ||
    typeof candidate.releaseType !== "string" ||
    !RELEASE_TYPES.includes(candidate.releaseType) ||
    typeof candidate.automaticInstallEligible !== "boolean" ||
    typeof candidate.releaseNotes !== "string"
  ) {
    return null;
  }
  return {
    availableVersion: candidate.availableVersion,
    releaseType: candidate.releaseType as AvailableRelease["releaseType"],
    automaticInstallEligible: candidate.automaticInstallEligible,
    releaseNotes: candidate.releaseNotes,
  };
}
