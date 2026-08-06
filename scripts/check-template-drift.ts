/**
 * Reports whether the Velvet an installation receives can read what Velvet writes.
 *
 * The setup service writes `velvet.yml` from this repository's contracts, and
 * the workflows it installs run the monitor from whatever revision they pin. A
 * pin older than the configuration contract refuses a field the service writes,
 * and the installation's first run fails with `INVALID_CONFIGURATION`.
 *
 * There is one place to judge. An installation receives the release artefact's
 * files and nothing else, and the artefact pins the version it was cut as.
 *
 * The invariant is narrow and worth stating exactly: every configuration this
 * repository can produce has to validate against the contracts each pinned
 * commit ships. This checks that directly, by validating against those
 * contracts rather than by comparing version numbers, because a version number
 * says nothing about which fields a schema accepts.
 *
 * It reports rather than repairs, because a check that corrected the drift
 * silently would hide how often it happens.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

/** The artefact the setup service installs and updates from. */
const ARTEFACT = "apps/setup-service/src/velvet-release.generated.ts";
/**
 * Any Velvet action inside the artefact, whether the monitor or the site build
 * at the repository root, and whether it names a tag or a commit.
 *
 * Anchored on `uses:`, because the file also opens with a comment naming the
 * revision it was cut from, and that is a provenance note rather than something
 * an installation runs.
 */
const ARTEFACT_PIN =
  /uses:\s*phranck\/velvet(?![-\w])(?:\\?\/[^@\s\\"]+)?@([^\s\\"']+)/gu;

/** A place an installation's Velvet pin comes from. */
interface Source {
  /** How it is named in a report. */
  name: string;
  /** Whether failing to read it is this repository's own fault. */
  fatalWhenUnreadable: boolean;
  /** The revision it pins, or a reason it could not be read. */
  pin: string | { reason: string };
}

/** What the comparison concluded about one source. */
type Outcome =
  | { kind: "aligned"; pin: string }
  | { kind: "drifted"; pin: string; errors: unknown }
  | { kind: "unpublished"; pin: string }
  | { kind: "unreachable"; reason: string };

const repositoryRoot = resolve(import.meta.dir, "..");

/**
 * Runs a command and returns what it printed.
 *
 * @param command - The programme and its arguments, never a shell string.
 * @param cwd - Where to run it.
 * @returns The trimmed standard output, or `null` when it failed.
 */
function run(command: readonly string[], cwd: string): string | null {
  const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  return result.success ? result.stdout.toString().trim() : null;
}

/**
 * Reads the revision the compiled release artefact pins its actions to.
 *
 * The artefact holds the workflow sources as JSON string literals, so the pins
 * are read out of it as text. A release naming more than one revision is a
 * defect in its own right and is reported as such, rather than one of them
 * being picked to judge.
 *
 * @returns The revision the artefact pins, or a reason it could not be read.
 */
async function artefactPin(): Promise<string | { reason: string }> {
  let source: string;
  try {
    source = await readFile(resolve(repositoryRoot, ARTEFACT), "utf8");
  } catch (error) {
    return { reason: `it could not be read: ${String(error)}` };
  }
  const pins = new Set(
    [...source.matchAll(ARTEFACT_PIN)].map(([, commit]) => commit!),
  );
  if (pins.size === 0) return { reason: "it pins no Velvet action" };
  if (pins.size > 1) {
    return {
      reason: `it pins ${pins.size} different Velvet revisions: ${[...pins]
        .map((pin) => pin)
        .join(", ")}`,
    };
  }
  return [...pins][0]!;
}

/**
 * Validates a configuration against the contracts a given commit ships.
 *
 * The commit is checked out into its own worktree and its contracts are built
 * there, so what runs is the code that commit actually contains rather than
 * today's code reading yesterday's schema.
 *
 * @param commit - The commit whose contracts should judge the configuration.
 * @param configuration - The configuration to validate.
 * @returns The errors it was refused with, or nothing when it validates.
 */
async function validateAgainst(
  commit: string,
  configuration: unknown,
): Promise<{ errors: unknown } | undefined> {
  const worktree = await mkdtemp(resolve(tmpdir(), "velvet-pinned-"));
  try {
    if (run(["git", "worktree", "add", "--detach", worktree, commit], repositoryRoot) === null) {
      return { errors: `${commit} could not be checked out` };
    }
    run(["bun", "install", "--frozen-lockfile"], worktree);
    run(["bun", "run", "--filter", "@velvet/contracts", "build"], worktree);

    const probe = resolve(worktree, "check-pinned-contract.mjs");
    await writeFile(
      probe,
      'import { validateVelvetConfiguration } from "./packages/contracts/dist/index.js";\n' +
        `const result = validateVelvetConfiguration(${JSON.stringify(configuration)});\n` +
        "if (!result.success) console.log(JSON.stringify(result.errors));\n",
    );
    const output = run(["bun", probe], worktree);
    if (output === null) return { errors: "the pinned contracts could not be run" };
    return output === "" ? undefined : { errors: JSON.parse(output) };
  } finally {
    run(["git", "worktree", "remove", "--force", worktree], repositoryRoot);
    await rm(worktree, { recursive: true, force: true });
  }
}

/**
 * The configuration this check judges the pin by.
 *
 * Every field the current schema offers, because the drift that matters is a
 * field the service can write and the pinned commit has never heard of. A
 * minimal configuration would validate against almost any pin and prove
 * nothing.
 */
async function currentConfiguration(): Promise<unknown> {
  const { load } = await import("js-yaml");
  const fixture = resolve(
    repositoryRoot,
    "packages/contracts/fixtures/valid/configuration/full-configuration.yml",
  );
  return load(await Bun.file(fixture).text());
}

/**
 * The version this repository states it is, from the one place it states it.
 *
 * Read so that a pin naming a tag which does not exist yet can be told from one
 * naming a tag that never will. The first is a release between cutting its
 * artefact and publishing its tag, and there is nothing wrong with it.
 *
 * @returns The version in the root manifest.
 */
async function declaredVersion(): Promise<string> {
  const manifest: unknown = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  );
  const version =
    typeof manifest === "object" && manifest !== null
      ? (manifest as { version?: unknown }).version
      : undefined;
  if (typeof version !== "string") {
    throw new Error("The root package.json states no version.");
  }
  return version;
}

/**
 * Judges one source's pin.
 *
 * @param source - Where the pin came from and what it is.
 * @param configuration - The configuration its contracts have to accept.
 * @returns What the comparison concluded.
 */
async function judge(source: Source, configuration: unknown): Promise<Outcome> {
  if (typeof source.pin !== "string") {
    return { kind: "unreachable", reason: source.pin.reason };
  }
  // A pin names the version tag the artefact was cut as, and publishing is what
  // creates that tag. Between the two there is nothing to resolve, which is a
  // release part-way through rather than a fault. A pin naming any other
  // version that does not exist is one nobody can resolve, and that is worth
  // reporting.
  if (run(["git", "rev-parse", "--verify", `${source.pin}^{commit}`], repositoryRoot) === null) {
    return source.pin === `v${await declaredVersion()}`
      ? { kind: "unpublished", pin: source.pin }
      : {
          kind: "unreachable",
          reason: `${source.pin} resolves to nothing in this repository`,
        };
  }
  const refused = await validateAgainst(source.pin, configuration);
  return refused
    ? { kind: "drifted", pin: source.pin, errors: refused.errors }
    : { kind: "aligned", pin: source.pin };
}

const configuration = await currentConfiguration();
const sources: Source[] = [
  { name: ARTEFACT, fatalWhenUnreadable: true, pin: await artefactPin() },
];

/** Revisions that judged well, and which sources named them. */
const accepted = new Map<string, string[]>();
let failed = false;

for (const source of sources) {
  const outcome = await judge(source, configuration);

  if (outcome.kind === "unpublished") {
    console.log(
      `${source.name} pins ${outcome.pin}, the version this repository is preparing. Its tag is created by publishing, so there is nothing to judge yet.`,
    );
    console.log("Run this again after the tag exists, per documentation/releasing.md.");
    continue;
  }

  if (outcome.kind === "unreachable") {
    const report = source.fatalWhenUnreadable ? console.error : console.log;
    report(`The pin in ${source.name} could not be read. ${outcome.reason}`);
    if (source.fatalWhenUnreadable) failed = true;
    else report("Nothing is concluded from that, and nothing has drifted.");
    continue;
  }

  if (outcome.kind === "drifted") {
    failed = true;
    console.error(
      `${source.name} pins ${outcome.pin}, whose contracts refuse a configuration this repository can write.`,
    );
    console.error(JSON.stringify(outcome.errors, null, 2));
    continue;
  }

  accepted.set(outcome.pin, [...(accepted.get(outcome.pin) ?? []), source.name]);
}

// One artefact naming two revisions would give an installation workflows that
// disagree with each other, and the run that fails is whichever is behind.
if (accepted.size > 1) {
  failed = true;
  console.error("The artefact pins more than one Velvet revision:");
  for (const [pin, where] of accepted) {
    console.error(`  ${pin} in ${where.join(", ")}`);
  }
}

if (failed) {
  console.error(
    "\nAn installation created now could fail its first run with INVALID_CONFIGURATION.",
  );
  console.error(
    `Raise the pin in template/.github/workflows and cut a new artefact from ${ARTEFACT}.`,
  );
  process.exit(1);
}

for (const [pin, where] of accepted) {
  console.log(
    `${where.join(" and ")} pin ${pin}, whose contracts accept everything this repository can write.`,
  );
}
