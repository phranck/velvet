import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  compareVelvetSemanticVersions,
  CONFIGURATION_SCHEMA_VERSION,
  CONTRACT_SCHEMA_VERSION,
  INITIAL_TEMPLATE_PATHS,
  MANAGED_TEMPLATE_PATHS,
  VELVET_TEMPLATE_REPOSITORY,
  validateVelvetReleaseManifest,
  type VelvetReleaseManifest,
} from "@velvet/contracts";
import { buildReleaseManifest, compatibilityFloor } from "@velvet/template-files";

/**
 * Regenerates the release artefact compiled into the setup service.
 *
 * The artefact pins one immutable template revision together with the exact
 * file contents read from it, so an installed repository is updated from
 * reviewed bytes rather than from whatever the template happens to contain when
 * the update runs.
 *
 * The version comes from the root `package.json`, which is where Velvet states
 * it. Passing it here as well would let an artefact be cut against a number
 * nobody decided, and leave the artefact and the repository claiming different
 * versions.
 *
 * The compatibility floor is derived rather than passed. A release inherits the
 * floor its predecessor declared and raises it only where it changes a schema,
 * so an installation that missed a release is still offered the next one.
 * `--minimum` overrides that derivation and exists for repairing an artefact
 * whose floor was recorded wrongly.
 *
 * Usage:
 *   bun run scripts/build-release.ts --type feature \
 *     --notes scripts/release-notes.md \
 *     [--commit <sha>] [--minimum <version>] [--automatic]
 */

const RELEASE_TYPES = ["security", "fix", "feature"] as const;
const outputPath = resolve(
  import.meta.dirname,
  "../src/velvet-release.generated.ts",
);
const repositoryRoot = resolve(import.meta.dirname, "../../..");

type ReleaseType = (typeof RELEASE_TYPES)[number];

function argument(name: string): string | undefined {
  const index = Bun.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : Bun.argv[index + 1];
}

function flag(name: string): boolean {
  return Bun.argv.includes(`--${name}`);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Reads the version this artefact is cut as.
 *
 * The root manifest is the one place Velvet states its version, and
 * `scripts/sync-version.mjs` writes every other place from it.
 *
 * @returns The semantic version stated there.
 */
async function declaredVersion(): Promise<string> {
  const manifestPath = resolve(import.meta.dirname, "../../../package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    version?: unknown;
  };
  if (
    typeof manifest.version !== "string" ||
    !/^\d+\.\d+\.\d+$/u.test(manifest.version)
  ) {
    fail(`${manifestPath} must state a semantic version, such as 1.1.0.`);
  }
  return manifest.version;
}

/**
 * The commit these files are cut from, which is this repository's own head.
 *
 * They live here now, so the revision an installation is built from is the
 * revision of the code that builds it. There is no second repository whose
 * head could be something else.
 */
function sourceCommit(): string {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    stdout: "pipe",
  });
  const sha = result.success ? result.stdout.toString().trim() : "";
  if (!/^[a-f0-9]{40}$/u.test(sha)) {
    fail("Could not read this repository's head commit.");
  }
  return sha;
}

/**
 * Reads the files an installation is given, from the directory beside the code.
 *
 * The workflows name the supported major tag, `@v1`, because a pin to a commit
 * of this repository written inside this repository is a number nobody can keep
 * current. Cutting a release replaces it with the version being published, so
 * an installation runs the exact revision it was given rather than whatever the
 * major tag points at later.
 *
 * @param version - The version being cut, which the pins are rewritten to.
 * @returns Every path an installation receives, mapped to its contents.
 */
async function templateSources(version: string): Promise<Record<string, string>> {
  const paths = [
    ...MANAGED_TEMPLATE_PATHS.filter((path) => path !== "velvet.lock.json"),
    ...INITIAL_TEMPLATE_PATHS,
  ];
  const entries = await Promise.all(
    paths.map(async (path) => {
      const file = resolve(repositoryRoot, "template", path);
      const contents = await readFile(file, "utf8").catch(() => {
        fail(`Could not read template/${path}.`);
      });
      return [
        path,
        (contents as string).replaceAll(
          /(phranck\/velvet(?:\/[^@\s]+)?)@v\d+(?![\w.])/gu,
          `$1@v${version}`,
        ),
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Reads the manifest of the artefact currently in the repository.
 *
 * Using it as the predecessor makes the publication gate enforce forward
 * versioning and correct release classification automatically, so a version
 * that goes backwards or a feature released as a fix cannot be generated at
 * all.
 *
 * An artefact already carrying the version being cut is not a predecessor but
 * an earlier attempt at the same release, so it is discarded and its own
 * predecessor takes its place. Without that, correcting anything in an
 * unpublished release would cost a version number every time.
 */
async function currentArtefact(): Promise<VelvetReleaseManifest | undefined> {
  let source: string;
  try {
    source = await readFile(outputPath, "utf8");
  } catch {
    return undefined;
  }
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1) return undefined;
  try {
    const parsed = JSON.parse(source.slice(start, end + 1)) as {
      manifest?: unknown;
    };
    const validation = validateVelvetReleaseManifest(parsed.manifest);
    return validation.success ? validation.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The newest version published before the one being cut.
 *
 * Read from the release tags rather than from the artefact, because an artefact
 * records the oldest version it installs onto and that is the version it
 * follows only where a release raised the floor itself.
 *
 * @param before - The version being cut, which is excluded from the search so a
 *   release that has already been tagged does not find itself.
 * @returns The version of the last release published before it, or undefined
 *   when nothing was.
 */
function lastPublishedVersion(before: string): string | undefined {
  const result = Bun.spawnSync(["git", "tag", "--list", "v*"], {
    cwd: repositoryRoot,
    stdout: "pipe",
  });
  if (!result.success) return undefined;
  return result.stdout
    .toString()
    .split("\n")
    .map((tag) => tag.trim().replace(/^v/u, ""))
    .filter((candidate) => /^\d+\.\d+\.\d+$/u.test(candidate))
    .filter((candidate) => compareVelvetSemanticVersions(candidate, before) < 0)
    .sort(compareVelvetSemanticVersions)
    .at(-1);
}

/**
 * Rebuilds the predecessor of an artefact that is being cut again.
 *
 * A recut has to move forward from whatever the artefact it replaces moved
 * forward from. That version comes from the release tags, because the artefact
 * itself records only the floor it inherited.
 *
 * Its compatibility block is the artefact's own, which holds only whilst the
 * artefact announced no migration. When it announced one, its predecessor
 * carried different schema versions and cannot be reconstructed from what is
 * left, so this stops rather than inventing a compatibility block.
 *
 * @param artefact - The unpublished artefact being replaced.
 * @returns The manifest the recut has to be newer than, or undefined when the
 *   artefact is a first release and has no predecessor.
 */
function recutPredecessor(
  artefact: VelvetReleaseManifest,
): VelvetReleaseManifest | undefined {
  const version = lastPublishedVersion(artefact.version);
  if (version === undefined) return undefined;
  if (
    artefact.compatibility.configurationMigrationRequired ||
    artefact.compatibility.dataMigrationRequired
  ) {
    fail(
      `The artefact already holding ${artefact.version} announces a migration, so its predecessor cannot be reconstructed. Raise the version instead of recutting.`,
    );
  }
  return { ...artefact, version };
}

const version = await declaredVersion();
const releaseTypeInput = argument("type") ?? fail("Pass --type <security|fix|feature>.");
if (!RELEASE_TYPES.includes(releaseTypeInput as ReleaseType)) {
  fail(`--type must be one of ${RELEASE_TYPES.join(", ")}.`);
}
const releaseType = releaseTypeInput as ReleaseType;
const notesPath = argument("notes") ?? fail("Pass --notes <path to markdown>.");
const releaseNotes = await readFile(resolve(process.cwd(), notesPath), "utf8");
const commit = argument("commit") ?? sourceCommit();
const current = await currentArtefact();
/**
 * What this release has to move forward from.
 *
 * Normally the artefact in the repository. When that artefact already carries
 * this version, it is a recut of a release that has not been published, so its
 * own predecessor is used instead and is read from the release tags.
 */
const previous =
  current === undefined || current.version !== version
    ? current
    : recutPredecessor(current);
const sources = await templateSources(version);

/** Whether this release changes a schema an installation already holds. */
const configurationMigrationRequired =
  previous !== undefined &&
  previous.compatibility.configurationSchemaVersion !==
    CONFIGURATION_SCHEMA_VERSION;
const dataMigrationRequired =
  previous !== undefined &&
  previous.compatibility.dataSchemaVersion !== CONTRACT_SCHEMA_VERSION;

const built = buildReleaseManifest({
  version,
  releaseType,
  automaticInstallEligible: flag("automatic"),
  compatibility: {
    minimumInstalledVersion:
      argument("minimum") ??
      compatibilityFloor(
        previous,
        version,
        configurationMigrationRequired || dataMigrationRequired,
      ),
    configurationSchemaVersion: CONFIGURATION_SCHEMA_VERSION,
    dataSchemaVersion: CONTRACT_SCHEMA_VERSION,
    configurationMigrationRequired,
    dataMigrationRequired,
  },
  releaseNotes,
  source: {
    repository: VELVET_TEMPLATE_REPOSITORY,
    commit,
    files: sources,
  },
  ...(previous ? { previousManifest: previous } : {}),
});

if (!built.success) {
  console.error("The release was rejected by the publication rules:");
  for (const error of built.errors) {
    console.error(`  ${error.code} at ${error.path}: ${error.message}`);
  }
  process.exit(1);
}

const artefact = { manifest: built.data, sources };
const banner = [
  "// Generated by scripts/build-release.ts. Do not edit by hand.",
  `// Velvet ${built.data.version} from ${VELVET_TEMPLATE_REPOSITORY}@${commit}.`,
  "",
  "export const VELVET_RELEASE = ",
].join("\n");
await writeFile(
  outputPath,
  `${banner}${JSON.stringify(artefact, null, 2)} as const;\n`,
  "utf8",
);

console.log(
  `Wrote Velvet ${built.data.version} from ${commit} to ${outputPath}.`,
);
