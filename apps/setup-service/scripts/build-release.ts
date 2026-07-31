import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CONFIGURATION_SCHEMA_VERSION,
  CONTRACT_SCHEMA_VERSION,
  MANAGED_TEMPLATE_PATHS,
  VELVET_TEMPLATE_REPOSITORY,
  validateVelvetReleaseManifest,
  type VelvetReleaseManifest,
} from "@velvet/contracts";
import { buildReleaseManifest } from "@velvet/template-files";

/**
 * Regenerates the release artefact compiled into the setup service.
 *
 * The artefact pins one immutable template revision together with the exact
 * file contents read from it, so an installed repository is updated from
 * reviewed bytes rather than from whatever the template happens to contain when
 * the update runs.
 *
 * Usage:
 *   bun run scripts/build-release.ts --version 2.0.0 --type feature \
 *     --notes ../../CHANGELOG.md [--commit <sha>] [--automatic]
 */

const RELEASE_TYPES = ["security", "fix", "feature"] as const;
const outputPath = resolve(
  import.meta.dirname,
  "../src/velvet-release.generated.ts",
);

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

async function templateHeadCommit(): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${VELVET_TEMPLATE_REPOSITORY}/commits/HEAD`,
    { headers: { Accept: "application/vnd.github+json" } },
  );
  if (!response.ok) {
    fail(`Could not read the template head commit: ${response.status}`);
  }
  const body = (await response.json()) as { sha?: unknown };
  if (typeof body.sha !== "string" || !/^[a-f0-9]{40}$/u.test(body.sha)) {
    fail("The template head commit response was invalid.");
  }
  return body.sha;
}

async function templateSources(
  commit: string,
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    MANAGED_TEMPLATE_PATHS.filter((path) => path !== "velvet.lock.json").map(
      async (path) => {
        const url = `https://raw.githubusercontent.com/${VELVET_TEMPLATE_REPOSITORY}/${commit}/${path}`;
        const response = await fetch(url);
        if (!response.ok) {
          fail(`Could not read ${path} at ${commit}: ${response.status}`);
        }
        return [path, await response.text()] as const;
      },
    ),
  );
  return Object.fromEntries(entries);
}

/**
 * Reads the manifest of the artefact currently in the repository.
 *
 * Using it as the predecessor makes the publication gate enforce forward
 * versioning and correct release classification automatically, so a mistyped
 * version or a feature released as a fix cannot be generated at all.
 */
async function previousManifest(): Promise<VelvetReleaseManifest | undefined> {
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

const version = argument("version") ?? fail("Pass --version <semver>.");
const releaseTypeInput = argument("type") ?? fail("Pass --type <security|fix|feature>.");
if (!RELEASE_TYPES.includes(releaseTypeInput as ReleaseType)) {
  fail(`--type must be one of ${RELEASE_TYPES.join(", ")}.`);
}
const releaseType = releaseTypeInput as ReleaseType;
const notesPath = argument("notes") ?? fail("Pass --notes <path to markdown>.");
const releaseNotes = await readFile(resolve(process.cwd(), notesPath), "utf8");
const commit = argument("commit") ?? (await templateHeadCommit());
const previous = await previousManifest();
const sources = await templateSources(commit);

const built = buildReleaseManifest({
  version,
  releaseType,
  automaticInstallEligible: flag("automatic"),
  compatibility: {
    minimumInstalledVersion: argument("minimum") ?? previous?.version ?? version,
    configurationSchemaVersion: CONFIGURATION_SCHEMA_VERSION,
    dataSchemaVersion: CONTRACT_SCHEMA_VERSION,
    configurationMigrationRequired:
      previous !== undefined &&
      previous.compatibility.configurationSchemaVersion !==
        CONFIGURATION_SCHEMA_VERSION,
    dataMigrationRequired:
      previous !== undefined &&
      previous.compatibility.dataSchemaVersion !== CONTRACT_SCHEMA_VERSION,
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
