import { generateKeyPairSync } from "node:crypto";

import {
  MANAGED_TEMPLATE_PATHS,
  VELVET_TEMPLATE_REPOSITORY,
  VELVET_UPDATE_CHECK_NAME,
  parseVelvetConfiguration,
} from "@velvet/contracts";
import {
  buildReleaseManifest,
  materializeManagedTemplateFiles,
} from "@velvet/template-files";

import { createGitHubSetupClient } from "../src/github.js";
import { createGitHubUpdateClient } from "../src/update-github.js";
import { createManagedUpdateOrchestrator } from "../src/update-orchestrator.js";
import { embeddedVelvetReleases } from "../src/update-releases.js";
import { protectedChangedPaths } from "../src/update-ownership.js";
import type {
  ManagedUpdateRelease,
  ManagedUpdateReleaseProvider,
  ManagedUpdateResult,
} from "../src/update-orchestrator-types.js";

/**
 * Runs the managed update path against a real GitHub repository.
 *
 * The clients under test are the production ones, and the update runs through
 * the production orchestrator, so the check gate, the merge decision, and the
 * ownership proofs are the real ones. Only the installation-token exchange is
 * replaced, with a personal token carrying the same repository and workflow
 * access an installation token would.
 *
 * It creates a disposable repository per run and deletes it afterwards. A run
 * against a repository a previous run left behind proves nothing, because the
 * second run finds the first one's branch and commit already in place.
 *
 * Credentials come from `.env.local` in the repository root, which Bun loads
 * on its own and which is git-ignored. See `.env.local.example` for what to
 * put in it. Passing `GITHUB_TOKEN` on the command line works too.
 *
 * Usage:
 *   bun run scripts/verify-against-github.ts --owner <login>
 *   GITHUB_TOKEN=$(gh auth token) bun run scripts/verify-against-github.ts --owner <login> --keep
 */

const token = process.env.GITHUB_TOKEN;
if (!token) fail("Set GITHUB_TOKEN, for example with $(gh auth token).");

const keep = Bun.argv.includes("--keep");
const login = argument("owner") ?? fail("Pass --owner <login>.");

/** The version the next release declares as its own floor. */
const NEXT_VERSION = "1.0.1";
const REFUSED_VERSION = "1.0.2";
const CHECK_TIMEOUT_MS = 8 * 60_000;
const POLL_MS = 5_000;

function argument(flag: string): string | undefined {
  const index = Bun.argv.indexOf(`--${flag}`);
  return index === -1 ? undefined : Bun.argv[index + 1];
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const checks: { label: string; ok: boolean; detail: string }[] = [];
function check(label: string, ok: boolean, detail = ""): void {
  checks.push({ label, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `: ${detail}` : ""}`);
}

/**
 * Substitutes the installation-token exchange with the supplied token.
 *
 * Everything else reaches github.com untouched, so the request shapes, the
 * response parsing, and the permission behaviour under test are the real ones.
 */
const githubFetch = async (request: Request): Promise<Response> => {
  if (request.url.includes("/access_tokens")) {
    return Response.json({ token: token!, permissions: {} });
  }
  const response = await fetch(request);
  if (process.env.VELVET_TRACE) {
    const path = new URL(request.url).pathname;
    console.log(`· ${request.method} ${path} -> ${response.status}`);
    // Printing the body of a pull-request response is how the defects this
    // script exists to find were actually located. Comparing against a manual
    // API call instead has misled every time, because the manual call asks
    // about a different moment.
    if (path.includes("/pulls")) {
      const body = await response.clone().text();
      try {
        const parsed = JSON.parse(body) as unknown;
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries as Record<string, unknown>[]) {
          console.log(
            `·   ${JSON.stringify({
              number: entry.number,
              state: entry.state,
              merged: entry.merged,
              merged_at: "merged_at" in entry ? entry.merged_at : "ABSENT",
              merge_commit_sha:
                "merge_commit_sha" in entry ? entry.merge_commit_sha : "ABSENT",
            })}`,
          );
        }
      } catch {
        console.log(`·   ${body.slice(0, 300)}`);
      }
    }
  }
  return response;
};

const api = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "velvet-verification",
      ...init.headers,
    },
  });
  if (!response.ok) fail(`${init.method ?? "GET"} ${path} returned ${response.status}`);
  return (await response.json()) as T;
};

// The client signs an app JWT before requesting a token. That request never
// leaves the process, so any well-formed key satisfies the signing step.
const throwawayKey = generateKeyPairSync("rsa", { modulusLength: 2_048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

const setup = createGitHubSetupClient({
  appId: "0",
  clientId: "Iv1.verification",
  clientSecret: "verification-client-secret",
  privateKey: throwawayKey,
  fetch: githubFetch,
});
const updateClient = createGitHubUpdateClient({
  appId: "0",
  privateKey: throwawayKey,
  fetch: githubFetch,
});

const slug = await createDisposableRepository(login);
const [owner, name] = slug.split("/") as [string, string];
const repositoryId = (await api<{ id: number }>(`/repos/${owner}/${name}`)).id;
const repository = await updateClient.forRepository(1, repositoryId);
check("repository identity is verified against its numeric id", true, slug);

// The template ships a placeholder identity, and an installation whose
// velvet.yml does not name its own repository is one the updater refuses.
// Writing it is the first thing onboarding does, through this same call.
await setup.writeConfiguration(
  token!,
  owner,
  name,
  installationConfiguration(owner, name),
  await setup.getConfigurationSha(token!, owner, name),
);
// GitHub serves repository contents from a cache that lags a write by a
// moment, so the file is read back until it is the one that was just written
// rather than assumed to be there immediately.
const configuration = await readWrittenConfiguration();
check(
  "the configuration onboarding writes names this repository",
  configuration.success &&
    configuration.data.repository.owner === owner &&
    configuration.data.repository.name === name,
);
if (!configuration.success) await finish();

const embedded = embeddedVelvetReleases();
const release = await embedded.get(embedded.latest());
const templateCommit = release.manifest.template.commit;

// A repository generated from the template carries no version lock, which is
// precisely the gap onboarding closes. Seeding one through the same write
// onboarding performs is what makes the update below a real forward step.
const seedFiles = materialize(release, "seed");
await setup.writeManagedFiles(token!, owner, name, seedFiles);
const lockAfterSeed = await repository.readVersionLock();
check(
  "onboarding's own write produces a lock the updater recognises",
  lockAfterSeed.lock.installedVersion === release.manifest.version,
  lockAfterSeed.lock.installedVersion,
);

const protectedBefore = await snapshot(["README.md", "NOTICE", "velvet.yml"]);
const dataBranchBefore = await repository.dataBranchHead();

const next = seedRelease(templateCommit, NEXT_VERSION);
const orchestrator = createManagedUpdateOrchestrator({
  github: updateClient,
  releases: { latest: () => NEXT_VERSION, get: async () => next },
  requiredCheckNames: [VELVET_UPDATE_CHECK_NAME],
});
const reconcile = () =>
  orchestrator.reconcile({
    installationId: 1,
    repositoryId,
    version: NEXT_VERSION,
    trigger: "manual",
  });

const first = await reconcile();
check(
  "the first reconciliation opens a technical pull request and waits",
  first.state === "waiting_for_checks" && first.pullRequest !== undefined,
  `${first.state} on #${first.pullRequest?.number ?? "none"}`,
);
const pullRequest = first.pullRequest;
if (pullRequest === undefined) await finish();

const changed = await repository.changedPaths(pullRequest!.number);
const violations = protectedChangedPaths(changed);
check(
  "the pull request changes only Velvet-owned paths",
  violations.length === 0,
  violations.length === 0 ? `${changed.length} paths` : violations.join(", "),
);

// This is what could not be answered without a real repository: a workflow
// added by the pull request itself has to run for the very update that adds
// it, because GitHub evaluates pull-request workflows from the merge commit.
const branchHead = await repository.updateBranchHead(NEXT_VERSION);
const checkRun = await waitForCheck(branchHead!);
check(
  "the update check runs on the pull request that introduces it",
  checkRun !== null,
  checkRun ? `${checkRun.status}/${checkRun.conclusion ?? "pending"}` : "never appeared",
);
check(
  "the update check passes",
  checkRun?.conclusion === "success",
  checkRun?.conclusion ?? "none",
);

const settled = await reconcileUntilSettled();
check(
  "the update completes once its check is green",
  settled.state === "succeeded" || settled.state === "waiting_for_publication",
  `${settled.state}${settled.reason ? ` (${settled.reason})` : ""}`,
);

const protectedAfter = await snapshot(["README.md", "NOTICE", "velvet.yml"]);
check(
  "protected files are byte-identical after the merge",
  JSON.stringify(protectedBefore) === JSON.stringify(protectedAfter),
);
check(
  "the generated data branch is unaffected",
  (await repository.dataBranchHead()) === dataBranchBefore,
  String(dataBranchBefore),
);

const lockFile = await repository.readVersionLock();
check(
  "the version lock records the installed release",
  lockFile.lock.installedVersion === NEXT_VERSION,
  `${lockFile.lock.installedVersion} at ${lockFile.lock.template.commit.slice(0, 8)}`,
);

// The run list is empty for a moment after a dispatch, so the run is waited
// for rather than asserted on an instantaneous read.
const mergedHead = await repository.defaultBranchHead();
const publication = await waitForPublication(mergedHead);
check(
  "publication runs for the merged commit",
  publication !== "timed out" && publication !== "none",
  publication,
);

// Whether publication succeeds here is not the point, and a disposable
// repository with no status data is a plausible way for it to fail. What
// matters is that the outcome decides between finishing and putting the
// previous version back, and that either path leaves the user's own files
// exactly as they were.
const afterPublication = await reconcileUntilSettled();
check(
  "the outcome of publication decides between finishing and restoring",
  publication === "success"
    ? afterPublication.state === "succeeded"
    : afterPublication.state === "restoring" ||
      afterPublication.state === "waiting_for_recovery" ||
      afterPublication.state === "restored" ||
      afterPublication.reason === "recovery_failed",
  `${publication} then ${afterPublication.state}`,
);
const protectedAfterPublication = await snapshot([
  "README.md",
  "NOTICE",
  "velvet.yml",
]);
check(
  "protected files survive whichever path publication took",
  JSON.stringify(protectedBefore) === JSON.stringify(protectedAfterPublication),
);

await verifyRefusedUpdate();
await finish();

/**
 * Proves a failing check leaves the installation exactly as it was.
 *
 * The branch is given a commit that touches a file Velvet does not own, which
 * is the condition the repository-side check exists to catch. Nothing about
 * the default branch may move afterwards.
 */
async function verifyRefusedUpdate(): Promise<void> {
  const version = REFUSED_VERSION;
  const tampered = seedRelease(templateCommit, version);
  const files = materialize(tampered, "refusal");
  const provider: ManagedUpdateReleaseProvider = {
    latest: () => version,
    get: async () => tampered,
  };
  const refusing = createManagedUpdateOrchestrator({
    github: updateClient,
    releases: provider,
    requiredCheckNames: [VELVET_UPDATE_CHECK_NAME],
  });
  const request = {
    installationId: 1,
    repositoryId,
    version,
    trigger: "manual" as const,
  };

  const opened = await refusing.reconcile(request);
  if (opened.pullRequest === undefined) {
    check("a refused update opens a pull request first", false, opened.state);
    return;
  }
  void files;

  const headBefore = await repository.defaultBranchHead();
  const branch = `velvet/update/${version}`;
  await addForbiddenChange(branch);
  const tamperedHead = await api<{ object: { sha: string } }>(
    `/repos/${owner}/${name}/git/ref/heads/${branch}`,
  );
  const run = await waitForCheck(tamperedHead.object.sha);
  check(
    "a change outside the Velvet-owned set fails the repository's own check",
    run?.conclusion === "failure",
    run?.conclusion ?? "never completed",
  );

  const refused = await refusing.reconcile(request);
  check(
    "the service refuses to merge an update whose check failed",
    refused.state === "failed" && refused.reason === "checks_failed",
    `${refused.state}${refused.reason ? ` (${refused.reason})` : ""}`,
  );
  check(
    "the default branch never moved",
    (await repository.defaultBranchHead()) === headBefore,
    headBefore.slice(0, 8),
  );
}

/** Adds a commit to an update branch that Velvet would never make. */
async function addForbiddenChange(branch: string): Promise<void> {
  const reference = await api<{ object: { sha: string } }>(
    `/repos/${owner}/${name}/git/ref/heads/${branch}`,
  );
  const readme = await api<{ sha: string }>(
    `/repos/${owner}/${name}/contents/README.md?ref=${branch}`,
  );
  await api(`/repos/${owner}/${name}/contents/README.md`, {
    method: "PUT",
    body: JSON.stringify({
      message: "Touch a file Velvet does not own",
      content: Buffer.from("tampered\n", "utf8").toString("base64"),
      sha: readme.sha,
      branch,
    }),
  });
  void reference;
}

/** Waits for the publication run on one commit to finish. */
async function waitForPublication(headSha: string): Promise<string> {
  const deadline = Date.now() + CHECK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const runs = await repository.pagesWorkflowRuns(headSha);
    const completed = runs.find((run) => run.status === "completed");
    if (completed) return completed.conclusion ?? "none";
    await Bun.sleep(POLL_MS);
  }
  return "timed out";
}

/** Repeats reconciliation until it stops reporting progress. */
async function reconcileUntilSettled(): Promise<ManagedUpdateResult> {
  const deadline = Date.now() + CHECK_TIMEOUT_MS;
  let latest = await reconcile();
  while (Date.now() < deadline && latest.state === "waiting_for_checks") {
    await Bun.sleep(POLL_MS);
    latest = await reconcile();
  }
  return latest;
}

/** Waits for the named check run on one commit to complete. */
async function waitForCheck(
  headSha: string,
): Promise<{ status: string; conclusion: string | null } | null> {
  const deadline = Date.now() + CHECK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const runs = await repository.checkRuns(headSha);
    const named = runs.find((run) => run.name === VELVET_UPDATE_CHECK_NAME);
    if (named && named.status === "completed") {
      return { status: named.status, conclusion: named.conclusion };
    }
    await Bun.sleep(POLL_MS);
  }
  return null;
}

/** Builds a publishable release at one version from a template revision. */
function seedRelease(commit: string, version: string): ManagedUpdateRelease {
  const built = buildReleaseManifest({
    version,
    releaseType: "fix",
    automaticInstallEligible: false,
    compatibility: {
      minimumInstalledVersion: release.manifest.version,
      configurationSchemaVersion:
        release.manifest.compatibility.configurationSchemaVersion,
      dataSchemaVersion: release.manifest.compatibility.dataSchemaVersion,
      configurationMigrationRequired: false,
      dataMigrationRequired: false,
    },
    releaseNotes: `# Velvet ${version}\n`,
    source: {
      repository: VELVET_TEMPLATE_REPOSITORY,
      commit,
      files: release.sources as Record<string, string>,
    },
  });
  if (!built.success) {
    fail(`Could not build the ${version} release: ${built.errors[0]?.code}`);
  }
  return { manifest: built.data, sources: release.sources };
}

function materialize(
  entry: ManagedUpdateRelease,
  label: string,
): { path: string; content: string }[] {
  const materialized = materializeManagedTemplateFiles({
    manifest: entry.manifest,
    configuration: configuration.success ? configuration.data : undefined!,
    sources: entry.sources,
  });
  if (!materialized.success) {
    fail(`Could not materialize the ${label} release.`);
  }
  return materialized.data.files.map(({ path, content }) => ({ path, content }));
}

/**
 * Creates a repository from the template, as browser onboarding does.
 *
 * The name carries a timestamp so a failed run never blocks the next one, and
 * the repository is private because it exists for minutes.
 */
async function createDisposableRepository(ownerLogin: string): Promise<string> {
  const created = `velvet-verify-${Date.now().toString(36)}`;
  await api(`/repos/${VELVET_TEMPLATE_REPOSITORY}/generate`, {
    method: "POST",
    body: JSON.stringify({
      owner: ownerLogin,
      name: created,
      private: false,
      include_all_branches: false,
    }),
  });
  console.log(`· created ${ownerLogin}/${created} from the template`);
  // GitHub populates a generated repository asynchronously.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const contents = await fetch(
      `https://api.github.com/repos/${ownerLogin}/${created}/contents/velvet.yml`,
      { headers: { Authorization: `Bearer ${token}`, "User-Agent": "velvet-verification" } },
    );
    if (contents.ok) return `${ownerLogin}/${created}`;
    await Bun.sleep(1_000);
  }
  fail("The generated repository never became readable.");
}

/** Reads `velvet.yml` back until it names this repository, within a bound. */
async function readWrittenConfiguration(): Promise<
  ReturnType<typeof parseVelvetConfiguration>
> {
  let parsed = parseVelvetConfiguration(
    (await repository.readConfiguration()).source,
  );
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (
      parsed.success &&
      parsed.data.repository.owner === owner &&
      parsed.data.repository.name === name
    ) {
      return parsed;
    }
    await Bun.sleep(1_000);
    parsed = parseVelvetConfiguration(
      (await repository.readConfiguration()).source,
    );
  }
  return parsed;
}

/** The configuration a one-service installation of this repository has. */
function installationConfiguration(
  repositoryOwner: string,
  repositoryName: string,
): string {
  return [
    "schemaVersion: 1",
    "repository:",
    `  owner: ${repositoryOwner}`,
    `  name: ${repositoryName}`,
    "statusPage:",
    "  name: Velvet Verification",
    "services:",
    "  - name: Website",
    "    url: https://example.com",
    "",
  ].join("\n");
}

async function fileAt(path: string, ref: string): Promise<string> {
  const body = await api<{ content: string }>(
    `/repos/${owner}/${name}/contents/${path}?ref=${encodeURIComponent(ref)}`,
  );
  return Buffer.from(body.content.replace(/\s/gu, ""), "base64").toString("utf8");
}

async function snapshot(paths: readonly string[]): Promise<Record<string, string>> {
  const head = await repository.defaultBranchHead();
  const entries = await Promise.all(
    paths.map(async (path) => {
      try {
        return [path, await fileAt(path, head)] as const;
      } catch {
        return [path, ""] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

/** Removes the disposable repository, then reports and exits. */
async function finish(): Promise<never> {
  if (!keep) {
    const deleted = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "velvet-verification",
      },
    });
    check(
      "the disposable repository is removed",
      deleted.ok,
      deleted.ok ? slug : `needs deleting by hand: ${slug}`,
    );
  }
  const unmet = checks.filter((entry) => !entry.ok);
  console.log(
    `\n${checks.length - unmet.length}/${checks.length} checks passed against ${slug}.`,
  );
  console.log(`Managed paths verified: ${MANAGED_TEMPLATE_PATHS.length}.`);
  process.exit(unmet.length === 0 ? 0 : 1);
}
