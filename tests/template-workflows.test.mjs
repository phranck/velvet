import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "bun:test";
import { load } from "js-yaml";

/**
 * Holds the workflows an installation runs to the rules GitHub applies to them.
 *
 * These files are read by GitHub, not by anything here, so nothing else in this
 * repository notices when one of them stops doing its job. A workflow that
 * builds a page and never publishes it looks entirely healthy from the outside:
 * every run is green, and the only symptom is a page that quietly stops
 * changing.
 */

const WORKFLOW_DIRECTORY = new URL("../template/.github/workflows/", import.meta.url);

/**
 * The expressions that free a job from its implicit success check.
 *
 * An `if` without one of these keeps the default, which is that the job runs
 * only when everything above it succeeded. A job skipped upstream therefore
 * takes every job below it with it.
 */
const STATUS_FUNCTIONS = ["always(", "success(", "failure(", "cancelled("];

/** Reads every workflow an installation receives. */
async function workflows() {
  const names = (await readdir(WORKFLOW_DIRECTORY)).filter((name) =>
    name.endsWith(".yml"),
  );
  return Promise.all(
    names.map(async (name) => ({
      name,
      document: load(await readFile(new URL(name, WORKFLOW_DIRECTORY), "utf8")),
    })),
  );
}

/** The jobs a job names in `needs`, whichever form it was written in. */
function needsOf(job) {
  if (typeof job.needs === "string") return [job.needs];
  return Array.isArray(job.needs) ? job.needs : [];
}

/** Whether a job carries a condition at all, and so may be skipped. */
function conditional(job) {
  return typeof job.if === "string" && job.if.trim() !== "";
}

/** Whether a job's condition survives something above it being skipped. */
function survivesASkip(job) {
  const condition = typeof job.if === "string" ? job.if : "";
  return STATUS_FUNCTIONS.some((name) => condition.includes(name));
}

test("a job below a job that may be skipped states that it still runs", async () => {
  // The rule GitHub applies, written out: a skipped job skips everything that
  // needs it, unless the dependent job's condition contains one of the status
  // functions. So a job that can be skipped by its own condition must not sit
  // above a job that says nothing about it.
  //
  // This is the shape the deploy job had, and it is why a status page built
  // itself every five minutes for a day and published none of them: `monitor`
  // runs only on a manual start, `build` survived that with `always()`, and
  // `deploy` did not.
  for (const { name, document } of await workflows()) {
    const jobs = document.jobs ?? {};

    /** Whether this job, or anything above it, can be skipped. */
    const skippable = (jobName, seen = new Set()) => {
      if (seen.has(jobName)) return false;
      seen.add(jobName);
      const job = jobs[jobName];
      if (!job) return false;
      if (conditional(job)) return true;
      return needsOf(job).some((upstream) => skippable(upstream, seen));
    };

    for (const [jobName, job] of Object.entries(jobs)) {
      const exposed = needsOf(job).filter((upstream) => skippable(upstream));
      if (exposed.length === 0) continue;
      assert.ok(
        survivesASkip(job),
        `${name}: job "${jobName}" needs ${exposed
          .map((one) => `"${one}"`)
          .join(", ")}, which can be skipped, so GitHub skips "${jobName}" too. ` +
          `Its condition must contain one of ${STATUS_FUNCTIONS.map((one) => `${one})`).join(", ")}.`,
      );
    }
  }
});

test("the page workflow builds and then publishes what it built", async () => {
  // Named separately from the rule above, because this is the one that matters
  // to somebody with a status page: whatever else changes in this workflow, a
  // successful build has to reach GitHub Pages.
  const document = load(
    await readFile(new URL("velvet.yml", WORKFLOW_DIRECTORY), "utf8"),
  );
  const build = document.jobs?.build;
  const deploy = document.jobs?.deploy;

  assert.ok(build, "velvet.yml has no build job");
  assert.ok(deploy, "velvet.yml has no deploy job");
  assert.ok(
    needsOf(deploy).includes("build"),
    "the deploy job does not wait for the build",
  );
  assert.ok(
    survivesASkip(deploy),
    "the deploy job is skipped whenever anything above the build is skipped",
  );
  assert.match(
    deploy.if,
    /needs\.build\.result == 'success'/u,
    "the deploy job publishes without checking that the build succeeded",
  );
});
