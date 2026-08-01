import { generateKeyPairSync } from "node:crypto";

import {
  MANAGED_TEMPLATE_PATHS,
  parseVelvetConfiguration,
} from "@velvet/contracts";
import { materializeManagedTemplateFiles } from "@velvet/template-files";

import { createGitHubUpdateClient } from "../src/update-github.js";
import { embeddedVelvetReleases } from "../src/update-releases.js";
import { protectedChangedPaths } from "../src/update-ownership.js";

/**
 * Runs the managed update path against a real GitHub repository.
 *
 * The client under test is the production one. Only the installation-token
 * exchange is replaced, with a personal token carrying the same repository and
 * workflow access an installation token would, so every other request is
 * exactly what an installation performs. That is what makes this able to catch
 * a wrong API shape or a refused permission, which a double cannot.
 *
 * By default it creates a disposable repository from the template, verifies
 * against it, and deletes it again, so every run starts from the same state a
 * real user would. Repeating a run against a repository left behind by a
 * previous one proves nothing, because the second run finds the first one's
 * branch and commit already in place.
 *
 * Usage:
 *   GITHUB_TOKEN=$(gh auth token) bun run scripts/verify-against-github.ts --owner <login>
 *   GITHUB_TOKEN=... bun run scripts/verify-against-github.ts --repository <owner/name> --keep
 */

const token = process.env.GITHUB_TOKEN;
if (!token) fail("Set GITHUB_TOKEN, for example with $(gh auth token).");

const keep = Bun.argv.includes("--keep");
const suppliedRepository = argument("repository");
const login = argument("owner");
if (!suppliedRepository && !login) {
  fail("Pass --owner <login> to create a disposable repository, or --repository <owner/name>.");
}

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
    return Response.json({ token: token! });
  }
  const response = await fetch(request);
  if (process.env.VELVET_TRACE && request.url.includes("/pulls")) {
    const clone = response.clone();
    const body = await clone.text();
    console.log(`· ${request.method} ${new URL(request.url).pathname} -> ${response.status}`);
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const one = Array.isArray(parsed) ? parsed[0] : parsed;
      console.log("·", JSON.stringify(one && {
        number: (one as Record<string, unknown>).number,
        state: (one as Record<string, unknown>).state,
        html_url: (one as Record<string, unknown>).html_url,
        merged_at: (one as Record<string, unknown>).merged_at,
        merge_commit_sha: (one as Record<string, unknown>).merge_commit_sha,
        head: (one as { head?: { ref?: string; sha?: string } }).head,
        base: (one as { base?: { ref?: string; sha?: string } }).base,
      }, (key, value) => (key === "head" || key === "base")
        ? { ref: (value as { ref?: string })?.ref, sha: (value as { sha?: string })?.sha }
        : value));
    } catch {
      console.log("·", body.slice(0, 400));
    }
  }
  return response;
};

const api = async <T>(path: string): Promise<T> => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "velvet-verification",
    },
  });
  if (!response.ok) fail(`GET ${path} returned ${response.status}`);
  return (await response.json()) as T;
};

const slug = suppliedRepository ?? (await createDisposableRepository(login!));
const [owner, name] = slug.split("/") as [string, string];
const repositoryId = (await api<{ id: number }>(`/repos/${owner}/${name}`)).id;
// The client signs an app JWT before requesting a token. That request never
// leaves the process, so any well-formed key satisfies the signing step.
const throwawayKey = generateKeyPairSync("rsa", { modulusLength: 2_048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const client = createGitHubUpdateClient({
  appId: "0",
  privateKey: throwawayKey,
  fetch: githubFetch,
});
const repository = await client.forRepository(1, repositoryId);
check("repository identity is verified against its numeric id", true, slug);

const configurationFile = await repository.readConfiguration();
const configuration = parseVelvetConfiguration(configurationFile.source);
check("velvet.yml parses as a valid configuration", configuration.success);
if (!configuration.success) process.exit(1);

const release = await embeddedVelvetReleases().get(
  embeddedVelvetReleases().latest(),
);
const materialized = materializeManagedTemplateFiles({
  manifest: release.manifest,
  configuration: configuration.data,
  sources: release.sources,
});
check("the release materializes for this configuration", materialized.success);
if (!materialized.success) process.exit(1);
const files = materialized.data.files.map(({ path, content }) => ({ path, content }));

const protectedBefore = await snapshot(["README.md", "LICENSE", "velvet.yml"]);
const dataBranchBefore = await repository.dataBranchHead();

const head = await repository.defaultBranchHead();
const version = release.manifest.version;
let branchHead = await repository.updateBranchHead(version);
if (branchHead === null) {
  await repository.createUpdateBranch(version, head);
  // Mirrors the orchestrator: GitHub answers the single-ref read with 404 for
  // a moment after creating a ref, so confirm it rather than assume the head.
  const confirmed = await confirmBranch(version);
  check("a freshly created branch becomes readable", confirmed !== null);
  if (confirmed === null) await finish();
  branchHead = confirmed;
}
if (branchHead === null) await finish();
// `finish` never returns, but an await cannot express that, so the value is
// narrowed once here rather than asserted at each use below.
let updateHead = branchHead as string;
if (updateHead === head) {
  updateHead = await repository.commitUpdate(version, updateHead, files);
}
check("an update branch carries the complete managed set", true, updateHead.slice(0, 8));

const existing = await repository.pullRequests(version);
const pullRequest = existing[0]
  ?? (await repository.createPullRequest(version, updateHead, head));
check("a technical pull request exists", true, `#${pullRequest.number}`);

const changed = await repository.changedPaths(pullRequest.number);
const violations = protectedChangedPaths(changed);
check(
  "the pull request changes only Velvet-owned paths",
  violations.length === 0,
  violations.length === 0 ? `${changed.length} paths` : violations.join(", "),
);

const merge = await repository.mergePullRequest(
  pullRequest.number,
  version,
  pullRequest.headSha,
);
check("the pull request merges at the expected head", merge.merged);

const protectedAfter = await snapshot(["README.md", "LICENSE", "velvet.yml"]);
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
  lockFile.lock.installedVersion === version
    && lockFile.lock.template.commit === release.manifest.template.commit,
  `${lockFile.lock.installedVersion} at ${lockFile.lock.template.commit.slice(0, 8)}`,
);

const secretNames = [
  ...new Set(
    configuration.data.services.flatMap((service) =>
      service.checks.flatMap((entry) => entry.headers.map((header) => header.secret)),
    ),
  ),
];
if (secretNames.length > 0) {
  const workflow = await fileAt(
    ".github/workflows/velvet-status.yml",
    merge.sha ?? head,
  );
  check(
    "configured header secrets are mapped in the monitor workflow",
    secretNames.every((secret) => workflow.includes(secret)),
    secretNames.join(", "),
  );
}

const branchAfter = await repository.updateBranchHead(version);
if (branchAfter !== null) {
  await repository.deleteUpdateBranch(version, branchAfter);
}
check("the update branch is removed afterwards", true);

/**
 * Creates a repository from the template, as browser onboarding does.
 *
 * The name carries a timestamp so a failed run never blocks the next one, and
 * the repository is private because it exists for minutes.
 */
async function createDisposableRepository(ownerLogin: string): Promise<string> {
  const created = `velvet-verify-${Date.now().toString(36)}`;
  const response = await request(
    "POST",
    "/repos/phranck/velvet-template/generate",
    { owner: ownerLogin, name: created, private: true, include_all_branches: false },
  );
  if (!response.ok) {
    fail(`Could not create the disposable repository: ${response.status}`);
  }
  console.log(`· created ${ownerLogin}/${created} from the template`);
  // GitHub populates a generated repository asynchronously.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const contents = await request("GET", `/repos/${ownerLogin}/${created}/contents/velvet.yml`);
    if (contents.ok) return `${ownerLogin}/${created}`;
    await Bun.sleep(1_000);
  }
  fail("The generated repository never became readable.");
}

async function request(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "velvet-verification",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/**
 * Reads an update branch back until GitHub reports it, within a bounded wait.
 *
 * A ref is not immediately visible to the single-ref endpoint after creation.
 * This is the same window the orchestrator closes through its retrying read.
 */
async function confirmBranch(forVersion: string): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const found = await repository.updateBranchHead(forVersion);
    if (found !== null) return found;
    await Bun.sleep(500);
  }
  return null;
}

/** Removes the disposable repository, then reports and exits. */
async function finish(): Promise<never> {
  if (!suppliedRepository && !keep) {
    const deleted = await request("DELETE", `/repos/${owner}/${name}`);
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

await finish();
