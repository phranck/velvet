import {
  MANAGED_TEMPLATE_GENERATORS,
  MANAGED_TEMPLATE_PATHS,
  RELEASE_MANIFEST_SCHEMA_VERSION,
  type VelvetManagedFile,
} from "@velvet/contracts";

import { validateReleasePublication } from "./publication.js";
import { sha256 } from "./source.js";
import type {
  BuildReleaseManifestInput,
  ReleasePublicationResult,
} from "./types.js";

const VERSION_LOCK_PATH = "velvet.lock.json";

/**
 * Derives a complete release manifest from an immutable template revision and
 * validates it against the publication rules.
 *
 * Every Velvet-owned path is resolved from the closed managed set rather than
 * from a supplied list, and each path's strategy comes from the shared
 * generator mapping. A release can therefore neither omit a managed file nor
 * publish a configuration-dependent file as a static copy.
 *
 * @param input - Release metadata plus the template revision it is cut from.
 * @returns The validated manifest, or the first publication error. No partial
 *   manifest is ever returned.
 */
export function buildReleaseManifest(
  input: BuildReleaseManifestInput,
): ReleasePublicationResult {
  const managedFiles: VelvetManagedFile[] = [];
  for (const path of MANAGED_TEMPLATE_PATHS) {
    const generator = MANAGED_TEMPLATE_GENERATORS[path];
    // The lock is generated from the manifest itself, so it has no source file.
    if (generator === "version-lock-v1") {
      managedFiles.push({
        path: VERSION_LOCK_PATH,
        strategy: "generate",
        generator,
      });
      continue;
    }
    const source = input.source.files[path];
    if (source === undefined) {
      return {
        success: false,
        errors: [
          {
            code: "MISSING_TEMPLATE_SOURCE",
            path,
            message:
              "The release source does not contain the required managed template file.",
          },
        ],
      };
    }
    managedFiles.push(
      generator === undefined
        ? {
            path,
            strategy: "replace",
            sourcePath: path,
            sha256: sha256(source),
          }
        : {
            path,
            strategy: "generate",
            generator,
            sourcePath: path,
            sha256: sha256(source),
          },
    );
  }

  return validateReleasePublication({
    manifest: {
      schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
      version: input.version,
      releaseType: input.releaseType,
      automaticInstallEligible: input.automaticInstallEligible,
      template: {
        repository: input.source.repository,
        commit: input.source.commit,
      },
      compatibility: { ...input.compatibility },
      managedFiles,
      releaseNotes: input.releaseNotes,
    },
    ...(input.previousManifest === undefined
      ? {}
      : { previousManifest: input.previousManifest }),
    source: input.source,
  });
}
