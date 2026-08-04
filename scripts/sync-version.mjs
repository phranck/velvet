/**
 * Writes the version stated in the root manifest into every place derived from it.
 *
 * The root `package.json` states Velvet's version. This writes it outwards, and
 * `tests/version.test.mjs` fails when any derived place disagrees.
 *
 * The release artefact is not written here, because cutting one reads the
 * template over the network and needs release notes a person has written. The
 * test is what makes a forgotten artefact impossible to miss.
 *
 * Usage:
 *   bun run scripts/sync-version.mjs [--check]
 *
 * `--check` reports what would change and exits non-zero instead of writing,
 * which is what a gate wants.
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");

/**
 * Manifests carrying a version, relative to the repository root.
 *
 * Listed rather than discovered, because a glob would silently start covering a
 * workspace added later without anybody deciding that it should be versioned
 * with Velvet. `site` and `actions/sync-data` state no version and are absent
 * for that reason.
 */
const VERSIONED_MANIFESTS = [
  "packages/contracts/package.json",
  "packages/monitor/package.json",
  "packages/github-incidents/package.json",
  "packages/template-files/package.json",
  "apps/setup-service/package.json",
  "actions/monitor/package.json",
];

/**
 * Manifests that depend on a Velvet workspace.
 *
 * Every Velvet package is private and none is published, so a dependency on one
 * is always the copy in this repository. `workspace:*` says exactly that and
 * names no version, which is why a dependency range is never a place the
 * version has to be kept in step.
 */
const DEPENDANT_MANIFESTS = [...VERSIONED_MANIFESTS, "site/package.json"];

/** The backdrop generator, what it writes, and how its silkscreen reads. */
const BACKDROP = {
  script: "scripts/build-pcb-backdrop.mjs",
  output: "site/src/onboarding/pcb-backdrop.svg",
  revision: /STATUS BOARD REV (\d+\.\d+\.\d+)/u,
};

/**
 * Reads the version every other place is written from.
 *
 * @returns The semantic version stated in the root manifest.
 */
async function sourceVersion() {
  const manifest = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  const version = manifest.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/u.test(version)) {
    console.error(
      "The root package.json must state a semantic version, such as 1.1.0.",
    );
    process.exit(1);
  }
  return version;
}

/**
 * Applies the version to one manifest.
 *
 * Edited as text rather than through `JSON.parse` and `JSON.stringify`, so key
 * order, indentation, and the trailing newline survive a change that only ever
 * means to move a number.
 *
 * @param path - The manifest, relative to the repository root.
 * @param version - The version to write.
 * @returns The lines that changed, empty when it already agreed.
 */
async function applyTo(path, version) {
  const file = resolve(repositoryRoot, path);
  const source = await readFile(file, "utf8");
  const changes = [];
  let updated = source;

  if (VERSIONED_MANIFESTS.includes(path)) {
    updated = updated.replace(
      /^(\s*"version":\s*")([^"]*)(")/mu,
      (whole, before, current, after) => {
        if (current === version) return whole;
        changes.push(`version ${current} to ${version}`);
        return `${before}${version}${after}`;
      },
    );
  }

  updated = updated.replace(
    /^(\s*"(@velvet\/[a-z-]+)":\s*")(\d+\.\d+\.\d+)(")/gmu,
    (whole, before, name, current, after) => {
      changes.push(`${name} ${current} to workspace:*`);
      return `${before}workspace:*${after}`;
    },
  );

  if (changes.length > 0 && !checkOnly) await writeFile(file, updated, "utf8");
  return changes;
}

/**
 * Brings the board backdrop's silkscreen to the current version.
 *
 * Only the revision it prints is compared, not the whole file. The generator
 * puts the current year in the copyright line, so comparing the bytes would
 * turn every first of January into a red gate that no change caused.
 *
 * @param version - The version the silkscreen should read.
 * @returns Whether the backdrop stated something else.
 */
async function synchroniseBackdrop(version) {
  const output = resolve(repositoryRoot, BACKDROP.output);
  const shipped = await readFile(output, "utf8").catch(() => "");
  const printed = shipped.match(BACKDROP.revision)?.[1];

  // Produced beside the shipped file and compared, rather than trusting the
  // revision it prints. The version is one of several things the generator
  // decides, and comparing only that would leave a change to the artwork out of
  // the file it is drawn into.
  const draft = `${output}.draft`;
  const result = Bun.spawnSync(
    ["bun", resolve(repositoryRoot, BACKDROP.script), "--out", draft],
    { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
  );
  if (!result.success) {
    console.error(result.stderr.toString().trim());
    process.exit(1);
  }
  const produced = await readFile(draft, "utf8");

  // Everything but the copyright year, which the generator stamps from today
  // and which would otherwise make this differ every first of January.
  const comparable = (svg) => svg.replace(/Copyright © \d{4}/u, "Copyright ©");
  if (comparable(produced) === comparable(shipped)) {
    await rm(draft, { force: true });
    return false;
  }
  if (checkOnly) {
    await rm(draft, { force: true });
    return printed !== version || true;
  }
  await writeFile(output, produced, "utf8");
  await rm(draft, { force: true });
  return true;
}

const version = await sourceVersion();
const report = [];

for (const path of DEPENDANT_MANIFESTS) {
  for (const change of await applyTo(path, version)) {
    report.push(`${path}: ${change}`);
  }
}
if (await synchroniseBackdrop(version)) {
  report.push(`${BACKDROP.output}: the silkscreen reads ${version}`);
}

if (report.length === 0) {
  console.log(`Everything already states Velvet ${version}.`);
  process.exit(0);
}

for (const line of report) console.log(`  ${line}`);
if (checkOnly) {
  console.error(
    `\nThese places do not state Velvet ${version}. Run bun run version:sync.`,
  );
  process.exit(1);
}
console.log(`\nWrote Velvet ${version} to ${report.length} places.`);
