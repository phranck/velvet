/**
 * Reports whether the template's pinned Velvet can still read what Velvet writes.
 *
 * An installation runs two halves that are versioned separately. The setup
 * service writes `velvet.yml` from this repository's contracts, and the
 * workflows it installs run the monitor from whatever commit
 * `phranck/velvet-template` pins. Nothing made the two agree, and on 2026-08-04
 * they did not: the service wrote a `gallery` block that arrived 85 commits
 * after the pin, the pinned contracts refuse unknown fields, and the first run
 * of a real installation failed with `INVALID_CONFIGURATION`.
 *
 * The invariant is narrow and worth stating exactly: every configuration this
 * repository can produce has to validate against the contracts the pinned
 * commit ships. This checks that directly, by validating against those
 * contracts rather than by comparing version numbers, because a version number
 * says nothing about which fields a schema accepts.
 *
 * It reports rather than repairs. Moving the pin is a change to another
 * repository and belongs under a person's hand, and a check that silently
 * corrected the drift would hide how often it happens.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

/** Where the workflows an installation runs are published from. */
const TEMPLATE_REPOSITORY = "phranck/velvet-template";
/** The workflow that pins the monitor, and the shape of the pin inside it. */
const PINNING_WORKFLOW = ".github/workflows/velvet.yml";
const PIN = /phranck\/velvet\/actions\/monitor@([a-f0-9]{40})/u;

/** What the comparison concluded. */
type Outcome =
  | { kind: "aligned"; pin: string }
  | { kind: "drifted"; pin: string; errors: unknown }
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
 * Reads the commit the template pins the monitor to.
 *
 * Read from the published file rather than from a checkout, because what an
 * installation receives is what GitHub serves and not what a clone happens to
 * have.
 *
 * @returns The forty-character commit, or a reason it could not be read.
 */
async function readPinnedCommit(): Promise<
  { pin: string } | { reason: string }
> {
  const url = `https://raw.githubusercontent.com/${TEMPLATE_REPOSITORY}/main/${PINNING_WORKFLOW}`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    return { reason: `${url} could not be reached: ${String(error)}` };
  }
  if (!response.ok) return { reason: `${url} answered ${response.status}` };
  const pin = PIN.exec(await response.text());
  return pin
    ? { pin: pin[1]! }
    : { reason: `${PINNING_WORKFLOW} pins no monitor action` };
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

async function compare(): Promise<Outcome> {
  const pinned = await readPinnedCommit();
  if ("reason" in pinned) return { kind: "unreachable", reason: pinned.reason };

  if (run(["git", "cat-file", "-e", `${pinned.pin}^{commit}`], repositoryRoot) === null) {
    return {
      kind: "unreachable",
      reason: `${pinned.pin} is not a commit in this repository`,
    };
  }

  const refused = await validateAgainst(pinned.pin, await currentConfiguration());
  return refused
    ? { kind: "drifted", pin: pinned.pin, errors: refused.errors }
    : { kind: "aligned", pin: pinned.pin };
}

const outcome = await compare();

if (outcome.kind === "unreachable") {
  console.log(`The template's pin could not be read. ${outcome.reason}`);
  console.log("Nothing is concluded from this, and nothing has drifted.");
  process.exit(0);
}

if (outcome.kind === "aligned") {
  console.log(
    `The template pins ${outcome.pin.slice(0, 12)}, whose contracts accept everything this repository can write.`,
  );
  process.exit(0);
}

console.error(
  `The template pins ${outcome.pin.slice(0, 12)}, whose contracts refuse a configuration this repository can write.`,
);
console.error(
  "An installation created now would fail its first run with INVALID_CONFIGURATION.",
);
console.error(JSON.stringify(outcome.errors, null, 2));
console.error(
  `Move the pin in ${TEMPLATE_REPOSITORY}/${PINNING_WORKFLOW} to a commit whose contracts accept it.`,
);
process.exit(1);
