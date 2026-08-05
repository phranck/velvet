/**
 * Reports whether `main` holds code that no installation runs.
 *
 * An installation executes Velvet from a tag: `phranck/velvet@<version>` builds
 * its page and `phranck/velvet/actions/monitor@<version>` checks its services.
 * A fix merged here reaches nobody until that tag moves, and nothing said so.
 * The same fix was merged twice in one evening whilst the installation went on
 * failing on the code the tag still pointed at.
 *
 * What counts as installed code is asked of the build rather than listed by
 * hand. The status page is built and its module graph read back, so a file
 * becomes watched the moment the page imports it and stops being watched when
 * it does not. A hand-kept list of directories would drift in exactly the way
 * this check exists to catch, and it would cry wolf over the onboarding, which
 * no installation runs.
 *
 * It reports rather than repairs. Moving a tag publishes, and publishing
 * belongs under a person's hand.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";

import { build, type Plugin } from "vite";

const run = promisify(execFile);
const siteRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(siteRoot, "..");

/**
 * What an installation runs beyond the page's own module graph.
 *
 * The two actions and the site build's entry point, plus the dependency
 * manifests both actions install from, since a changed dependency is changed
 * behaviour. The scripts that entry point calls are read out of it rather than
 * listed here, so this stays true when one is added or dropped.
 */
const ALWAYS_INSTALLED = [
  "action.yml",
  "actions",
  "packages",
  "bun.lock",
  "package.json",
] as const;

/**
 * The site scripts the root action calls, read from the action itself.
 *
 * Anchored on the variable the action uses for the site directory, so a script
 * it stops calling stops being watched without anybody remembering to say so.
 */
async function calledScripts(): Promise<string[]> {
  const action = await readFile(resolve(repositoryRoot, "action.yml"), "utf8");
  const called = new Set<string>();
  for (const [, name] of action.matchAll(
    /\$VELVET_SITE\/scripts\/([\w.-]+)/gu,
  )) {
    called.add(`site/scripts/${name}`);
  }
  return [...called];
}

/** What the comparison concluded. */
type Outcome =
  | { state: "current"; tag: string }
  | { state: "drifted"; tag: string; files: string[] }
  | { state: "untagged"; tag: string };

async function git(...argv: string[]): Promise<string> {
  const { stdout } = await run("git", argv, {
    cwd: repositoryRoot,
    maxBuffer: 8 * 1_024 * 1_024,
  });
  return stdout.trim();
}

/** The version this repository states, which is the tag installations run. */
async function statedVersion(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  ) as { version?: unknown };
  if (typeof manifest.version !== "string") {
    throw new Error("The root package.json states no version.");
  }
  return `v${manifest.version}`;
}

/**
 * Every file of this repository that the status page is built from.
 *
 * Read from the build itself: Rollup knows which modules it pulled in, and
 * anything outside this repository or inside `node_modules` is dropped, since
 * a dependency is covered by the lockfile instead.
 */
async function pageSources(): Promise<Set<string>> {
  const found = new Set<string>();
  const collect: Plugin = {
    name: "velvet-collect-page-sources",
    buildEnd() {
      for (const id of this.getModuleIds()) {
        if (id.includes("node_modules") || id.startsWith("\0")) continue;
        const path = relative(repositoryRoot, id.split("?")[0]!);
        if (path.startsWith("..")) continue;
        found.add(path);
      }
    },
  };
  await build({
    root: siteRoot,
    logLevel: "silent",
    build: { write: false },
    plugins: [collect],
  });
  return found;
}

async function compare(): Promise<Outcome> {
  const tag = await statedVersion();
  try {
    await git("rev-parse", "--verify", `refs/tags/${tag}`);
  } catch {
    return { state: "untagged", tag };
  }

  const changed = new Set(
    (await git("diff", "--name-only", `${tag}..HEAD`)).split("\n").filter(Boolean),
  );
  if (changed.size === 0) return { state: "current", tag };

  const sources = await pageSources();
  const scripts = await calledScripts();
  const files = [...changed]
    .filter(
      (path) =>
        sources.has(path) ||
        scripts.includes(path) ||
        ALWAYS_INSTALLED.some(
          (installed) => path === installed || path.startsWith(`${installed}/`),
        ),
    )
    .filter((path) => !path.includes("/test/") && !path.endsWith(".test.ts"))
    .sort();
  return files.length === 0
    ? { state: "current", tag }
    : { state: "drifted", tag, files };
}

const outcome = await compare();

if (outcome.state === "current") {
  console.log(`Installations run ${outcome.tag}, which holds this code.`);
  process.exit(0);
}

if (outcome.state === "untagged") {
  console.error(
    `This repository states ${outcome.tag}, and no such tag exists. ` +
      "Nothing an installation could run has been published for this version.",
  );
  process.exit(1);
}

console.error(
  `Installations run ${outcome.tag}, which does not contain these changes:`,
);
for (const file of outcome.files) console.error(`  ${file}`);
console.error(
  "\nA fix to code an installation runs is finished when it is tagged, not " +
    "when it is merged. Follow documentation/releasing.md.",
);
process.exit(1);
