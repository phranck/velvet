import {
  MANAGED_TEMPLATE_GENERATORS,
  MANAGED_TEMPLATE_PATHS,
  RELEASE_MANIFEST_SCHEMA_VERSION,
  type VelvetManagedFile,
  type VelvetReleaseManifest,
} from "@velvet/contracts";

import { validateReleasePublication } from "./publication.js";
import { sha256 } from "./source.js";
import type {
  BuildReleaseManifestInput,
  ReleasePublicationResult,
} from "./types.js";

const VERSION_LOCK_PATH = "velvet.lock.json";

/**
 * The oldest installed version a release may be applied to.
 *
 * A release inherits the floor its predecessor declared rather than raising it
 * to the predecessor's own version. Raising it every time would mean each
 * release accepts only the one before it, so an installation that missed a
 * single release could never be updated again through the Configurator.
 *
 * The floor rises only where a release changes a schema an installation already
 * holds. The migration is carried by the release that introduces it, so an
 * installation older than that one would skip it, and the floor is therefore
 * the predecessor's version.
 *
 * @param previous - The release this one follows, absent for a first release.
 * @param version - The version being cut. A first release declares itself,
 *   having no earlier installation it could be applied to.
 * @param migrationRequired - Whether this release changes the configuration
 *   schema or the data schema.
 * @returns The version to record as `minimumInstalledVersion`.
 */
export function compatibilityFloor(
  previous: VelvetReleaseManifest | undefined,
  version: string,
  migrationRequired: boolean,
): string {
  if (previous === undefined) return version;
  if (migrationRequired) return previous.version;
  return previous.compatibility.minimumInstalledVersion;
}

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
