import { validateReleasePublication } from "@velvet/template-files";

import { isRecord } from "./update-github-validation.js";
import type {
  ManagedUpdateRelease,
  ManagedUpdateReleaseProvider,
} from "./update-orchestrator-types.js";
import { VELVET_RELEASE } from "./velvet-release.generated.js";

/**
 * Release artefact compiled into the setup service.
 *
 * Both halves are embedded rather than fetched. The manifest is the trusted
 * description of a release, and the template sources are the exact file
 * contents it was cut from. Shipping them together removes any runtime
 * dependency on an external location, so an update cannot be influenced by
 * whatever a remote host happens to serve at the moment it runs.
 */
export interface EmbeddedVelvetRelease {
  manifest: unknown;
  sources: Record<string, string>;
}

/**
 * Builds the release source the update orchestrator reads from.
 *
 * The artefact is validated once, at construction, against the same
 * publication rules that gate a release. A build that shipped a tampered or
 * incomplete artefact therefore fails immediately on start-up rather than
 * part-way through a repository mutation.
 *
 * @param release - The embedded artefact, treated as untrusted input.
 * @returns A provider serving exactly the embedded version.
 * @throws When the artefact is not a complete, self-consistent release.
 */
export function createEmbeddedReleaseProvider(
  release: unknown,
): ManagedUpdateReleaseProvider {
  const validated = validateEmbeddedRelease(release);
  const version = validated.manifest.version;

  return {
    latest() {
      return version;
    },

    async get(requestedVersion) {
      if (requestedVersion !== version) {
        throw new Error("The requested version is not the embedded Velvet release.");
      }
      return validated;
    },
  };
}

/**
 * The release source this build of the setup service can install from.
 *
 * Regenerate the underlying artefact with `scripts/build-release.ts` whenever a
 * new Velvet version is published. Constructing the provider validates it, so a
 * broken artefact surfaces here rather than during a repository mutation.
 *
 * @returns A provider serving the compiled-in Velvet release.
 */
export function embeddedVelvetReleases(): ManagedUpdateReleaseProvider {
  return createEmbeddedReleaseProvider(VELVET_RELEASE);
}

function validateEmbeddedRelease(release: unknown): ManagedUpdateRelease {
  if (
    !isRecord(release) ||
    !isRecord(release.manifest) ||
    !isRecord(release.sources) ||
    !isSourceMap(release.sources)
  ) {
    throw new Error("The embedded Velvet release is invalid.");
  }
  const template = release.manifest.template;
  if (
    !isRecord(template) ||
    typeof template.repository !== "string" ||
    typeof template.commit !== "string"
  ) {
    throw new Error("The embedded Velvet release is invalid.");
  }

  // Reusing the publication gate proves the complete managed set is present and
  // that every source still hashes to the value the manifest recorded.
  const validation = validateReleasePublication({
    manifest: release.manifest,
    source: {
      repository: template.repository,
      commit: template.commit,
      files: release.sources,
    },
  });
  if (!validation.success) {
    throw new Error("The embedded Velvet release is invalid.");
  }
  return { manifest: validation.data, sources: release.sources };
}

function isSourceMap(value: Record<string, unknown>): value is Record<string, string> {
  return Object.values(value).every((entry) => typeof entry === "string");
}
