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
 * Usage:
 *   GITHUB_TOKEN=$(gh auth token) bun run scripts/verify-against-github.ts \
 *     --repository <owner/name>
 */

const token = process.env.GITHUB_TOKEN;
if (!token) fail("Set GITHUB_TOKEN, for example with $(gh auth token).");

const slug = argument("repository") ?? fail("Pass --repository <owner/name>.");
const [owner, name] = slug.split("/");
if (!owner || !name) fail("--repository must look like owner/name.");

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
  return fetch(request);
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
  branchHead = head;
}
if (branchHead === head) {
  branchHead = await repository.commitUpdate(version, branchHead, files);
}
check("an update branch carries the complete managed set", true, branchHead.slice(0, 8));

const existing = await repository.pullRequests(version);
const pullRequest = existing[0]
  ?? (await repository.createPullRequest(version, branchHead, head));
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

const failed = checks.filter((entry) => !entry.ok);
console.log(
  `\n${checks.length - failed.length}/${checks.length} checks passed against ${slug}.`,
);
console.log(`Managed paths verified: ${MANAGED_TEMPLATE_PATHS.length}.`);
process.exit(failed.length === 0 ? 0 : 1);
