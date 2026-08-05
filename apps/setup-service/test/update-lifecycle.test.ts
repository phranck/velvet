import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  MANAGED_TEMPLATE_PATHS,
  parseVelvetVersionLock,
  validateSetupRequest,
  type NormalizedVelvetConfiguration,
} from "@velvet/contracts";
import { buildReleaseManifest } from "@velvet/template-files";

import type { GitHubSetupClient } from "../src/github.js";
import { provisionVelvet } from "../src/provision.js";
import { createSessionStore } from "../src/session.js";
import { createEmbeddedReleaseProvider } from "../src/update-releases.js";
import { createManagedUpdateOrchestrator } from "../src/update-orchestrator.js";
import type {
  GitHubManagedFile,
  GitHubRepositoryUpdateClient,
  GitHubUpdateCheckRun,
  GitHubUpdateClient,
  GitHubUpdatePullRequest,
  GitHubUpdateWorkflowRun,
} from "../src/update-github.js";
import { VELVET_DATA_BRANCH } from "../src/update-ownership.js";

/**
 * End-to-end verification that onboarding and managed updates agree.
 *
 * Both halves run against one repository double, so this covers what unit
 * tests cannot: that a repository produced by setup is one the updater
 * recognises, and that an update leaves protected content exactly as
 * onboarding wrote it. A real GitHub run additionally needs App credentials
 * and is tracked separately.
 */

const TEMPLATE_COMMIT_ONE = "a".repeat(40);
const TEMPLATE_COMMIT_TWO = "b".repeat(40);

const sources: Record<string, string> = {
  ".github/ISSUE_TEMPLATE/config.yml": "blank_issues_enabled: false\n",
  ".github/ISSUE_TEMPLATE/maintenance.yml": `
name: Planned maintenance
body:
  - type: dropdown
    id: affected-targets
    attributes:
      options: [Placeholder]
`,
  ".github/workflows/deploy-announce.yml": "name: Deploy announce\n",
  ".github/workflows/maintenance-switch.yml": `
name: Maintenance switch
on:
  workflow_dispatch:
    inputs:
      services: { default: placeholder }
jobs: {}
`,
  ".github/workflows/velvet-response-times.yml": monitorWorkflow(),
  ".github/workflows/velvet-status.yml": monitorWorkflow(),
  ".github/workflows/velvet-update-check.yml": "name: Velvet update check\n",
  ".github/workflows/velvet.yml": monitorWorkflow(),
};

function monitorWorkflow(): string {
  return `
name: Velvet
on: { workflow_dispatch: {} }
jobs:
  monitor:
    steps:
      - uses: phranck/velvet/actions/monitor@${"c".repeat(40)}
        # Map only explicitly configured header secrets here.
`;
}

function release(version: string, commit: string, overrides: Record<string, unknown> = {}) {
  const built = buildReleaseManifest({
    version,
    releaseType: "feature",
    automaticInstallEligible: false,
    compatibility: {
      minimumInstalledVersion: "2.0.0",
      configurationSchemaVersion: 1,
      dataSchemaVersion: 1,
      configurationMigrationRequired: false,
      dataMigrationRequired: false,
    },
    releaseNotes: `# Velvet ${version}\n`,
    source: { repository: "phranck/velvet", commit, files: sources },
    ...overrides,
  });
  assert.equal(built.success, true, `release ${version} must be publishable`);
  return { manifest: built.success ? built.data : null, sources };
}

const configuration = ((): NormalizedVelvetConfiguration => {
  const parsed = validateSetupRequest({
    configuration: {
      schemaVersion: 1,
      repository: { owner: "example", name: "status" },
      statusPage: { name: "Example Status" },
      services: [
        {
          // A service sets either a url or explicit checks, never both. The
          // secret header is the point here: it only works when the workflow
          // maps it, which is what setup must generate.
          name: "Website",
          checks: [
            {
              name: "Health",
              url: "https://example.com/health",
              headers: [{ name: "Authorization", secret: "API_HEALTH_TOKEN" }],
            },
          ],
        },
      ],
    },
  });
  assert.equal(parsed.success, true);
  return parsed.success ? parsed.data.configuration : (null as never);
})();

/**
 * One repository, written by setup and then read by the updater.
 *
 * Protected paths are seeded with content nothing in the update path is
 * allowed to touch, so an accidental write shows up as a changed value rather
 * than having to be inferred from which calls were made.
 */
class Repository {
  files = new Map<string, string>([
    ["README.md", "# My status page\n"],
    ["LICENSE", "MIT\n"],
  ]);
  dataBranch: string | null = "9".repeat(40);
  defaultHead = "1".repeat(40);
  branchHead: string | null = null;
  branchFiles: GitHubManagedFile[] | null = null;
  pullRequest: GitHubUpdatePullRequest | null = null;
  checks = new Map<string, GitHubUpdateCheckRun[]>();
  runs = new Map<string, GitHubUpdateWorkflowRun[]>();

  protectedSnapshot(): Record<string, string> {
    return Object.fromEntries(
      [...this.files].filter(([path]) => !MANAGED_TEMPLATE_PATHS.includes(path as never)),
    );
  }
}

function setupClient(repository: Repository): GitHubSetupClient {
  const unused = () => {
    throw new Error("unused");
  };
  return {
    exchangeOAuthCode: unused,
    viewer: unused,
    listInstallations: unused,
    async account() {
      return { id: 42, login: "example", type: "User" };
    },
    async repositoryReadable() { return true; },
    async findRepository() { return null; },
    async repositoryInstallationId() { return null; },
    async deleteRepository() {},
    async createRepository() {
      // GitHub copies the template verbatim, placeholders included.
      for (const [path, content] of Object.entries(sources)) {
        repository.files.set(path, content);
      }
      return {
        id: 99,
        name: "status",
        owner: "example",
        ownerId: 42,
        htmlUrl: "https://github.com/example/status",
        defaultBranch: "main",
      };
    },
    async createInstallationToken() {
      return { token: "setup-token", canWriteWorkflows: true };
    },
    async deleteInstallation() {},
    async getConfigurationSha() {
      return "sha";
    },
    async writeConfiguration(_t, _o, _r, source) {
      repository.files.set("velvet.yml", source);
    },
    async writeManagedFiles(_t, _o, _r, files) {
      for (const file of files) repository.files.set(file.path, file.content);
    },
    async enablePages() {
      return { htmlUrl: "https://example.github.io/status/", status: "built" };
    },
    async configurePagesCustomDomain() {},
    async dispatchWorkflow() {
      return 1;
    },
    async workflowJobs() {
      return [
        { name: "Check services and publish initial data", status: "completed", conclusion: "success" },
        { name: "Build status page", status: "completed", conclusion: "success" },
        { name: "Deploy to GitHub Pages", status: "completed", conclusion: "success" },
      ];
    },
    async workflowRun() {
      return { id: 1, status: "completed", conclusion: "success", htmlUrl: "https://github.com/example/status/actions/runs/1" };
    },
    async pages() {
      return { htmlUrl: "https://example.github.io/status/", status: "built" };
    },
    async revokeUserToken() {},
  };
}

function updateClient(repository: Repository): GitHubUpdateClient {
  const mergeSha = "5".repeat(40);
  const updateSha = "4".repeat(40);
  const client: GitHubRepositoryUpdateClient = {
    repository: { id: 99, owner: "example", name: "status", defaultBranch: "main" },
    async defaultBranchHead() {
      return repository.defaultHead;
    },
    async readConfiguration() {
      return { source: repository.files.get("velvet.yml")!, blobSha: "8".repeat(40) };
    },
    async readVersionLock() {
      const parsed = parseVelvetVersionLock(repository.files.get("velvet.lock.json")!);
      assert.equal(parsed.success, true, "setup must leave a valid lock behind");
      return { lock: parsed.success ? parsed.data : (null as never), blobSha: "8".repeat(40) };
    },
    async readManagedFiles(ref) {
      if (ref === updateSha && repository.branchFiles) return repository.branchFiles;
      return MANAGED_TEMPLATE_PATHS.map((path) => ({
        path,
        content: repository.files.get(path) ?? "",
      }));
    },
    async changedPaths() {
      return repository.branchFiles?.map((file) => file.path) ?? [];
    },
    async dataBranchHead() {
      return repository.dataBranch;
    },
    async updateBranchHead() {
      return repository.branchHead;
    },
    async createUpdateBranch(_v, base) {
      repository.branchHead = base;
    },
    async commitUpdate(_v, _head, files) {
      repository.branchFiles = files.map((file) => ({ ...file }));
      repository.branchHead = updateSha;
      return updateSha;
    },
    async createPullRequest(_v, head, base) {
      repository.pullRequest = {
        number: 7,
        state: "open",
        htmlUrl: "https://github.com/example/status/pull/7",
        headRef: "velvet/update/2.1.0",
        headSha: head,
        baseRef: "main",
        baseSha: base,
        mergedAt: null,
        mergeCommitSha: null,
      };
      return structuredClone(repository.pullRequest);
    },
    async pullRequests() {
      return repository.pullRequest ? [structuredClone(repository.pullRequest)] : [];
    },
    async checkRuns(head) {
      return repository.checks.get(head) ?? [];
    },
    async pagesWorkflowRuns(head) {
      return repository.runs.get(head) ?? [];
    },
    async dispatchPagesWorkflow(head) {
      repository.runs.set(head, [
        { id: 2, status: "completed", conclusion: "success", htmlUrl: "https://github.com/example/status/actions/runs/2", headSha: head },
      ]);
    },
    async mergePullRequest() {
      for (const file of repository.branchFiles ?? []) {
        repository.files.set(file.path, file.content);
      }
      repository.defaultHead = mergeSha;
      repository.pullRequest = {
        ...repository.pullRequest!,
        state: "closed",
        mergedAt: "2026-08-01T00:00:00Z",
        mergeCommitSha: mergeSha,
      };
      return { merged: true, sha: mergeSha };
    },
    async deleteUpdateBranch() {
      repository.branchHead = null;
    },
    async commitRevert(_v, _head, files) {
      for (const file of files) repository.files.set(file.path, file.content);
      return "6".repeat(40);
    },
  };
  return { async forRepository() { return client; } };
}

function session() {
  const store = createSessionStore({ secret: "s".repeat(32), randomToken: () => "A".repeat(43) });
  const created = store.create();
  created.githubUserToken = "user-token";
  created.installation = {
    id: 7,
    accountLogin: "example",
    accountType: "User",
    repositorySelection: "selected",
  };
  return created;
}

test("an installation created by setup can be updated, leaving protected content intact", async () => {
  const repository = new Repository();
  const installed = release("2.0.0", TEMPLATE_COMMIT_ONE);

  const result = await provisionVelvet({
    session: session(),
    request: { configuration },
    github: setupClient(repository),
    releases: createEmbeddedReleaseProvider(installed),
    onEvent: () => {},
    sleep: async () => {},
  });
  assert.equal(result.type, "success");

  // Setup must leave every Velvet-owned path behind, tailored to the
  // configuration, or the updater has nothing coherent to compare against.
  for (const path of MANAGED_TEMPLATE_PATHS) {
    assert.equal(repository.files.has(path), true, `setup must write ${path}`);
  }
  assert.match(
    repository.files.get(".github/workflows/velvet-status.yml")!,
    /API_HEALTH_TOKEN/,
    "the configured header secret must reach the workflow",
  );
  const protectedBefore = repository.protectedSnapshot();
  const dataBranchBefore = repository.dataBranch;

  const updates = createManagedUpdateOrchestrator({
    github: updateClient(repository),
    releases: createEmbeddedReleaseProvider(release("2.1.0", TEMPLATE_COMMIT_TWO)),
    requiredCheckNames: ["Validate managed update"],
    maxReadAttempts: 1,
    sleep: async () => {},
  });
  const request = { installationId: 7, repositoryId: 99, version: "2.1.0", trigger: "manual" as const };

  const prepared = await updates.reconcile(request);
  assert.equal(prepared.state, "waiting_for_checks");

  repository.checks.set("4".repeat(40), [
    {
      id: 1,
      name: "Validate managed update",
      status: "completed",
      conclusion: "success",
      htmlUrl: "https://github.com/example/status/actions/runs/1",
      headSha: "4".repeat(40),
    },
  ]);
  const publishing = await updates.reconcile(request);
  assert.equal(publishing.state, "waiting_for_publication");

  const completed = await updates.reconcile(request);
  assert.equal(completed.state, "succeeded");

  // The point of the whole exercise: the user's own content is byte-identical.
  assert.deepEqual(repository.protectedSnapshot(), protectedBefore);
  assert.equal(repository.dataBranch, dataBranchBefore);
  assert.equal(repository.branchHead, null, "the update branch is cleaned up");

  const lock = parseVelvetVersionLock(repository.files.get("velvet.lock.json")!);
  assert.equal(lock.success, true);
  if (!lock.success) return;
  assert.equal(lock.data.installedVersion, "2.1.0");
  assert.equal(lock.data.template.commit, TEMPLATE_COMMIT_TWO);
  assert.match(
    repository.files.get(".github/workflows/velvet-status.yml")!,
    /API_HEALTH_TOKEN/,
    "the secret mapping survives the update",
  );
});

test("refuses to touch a repository whose default branch holds generated data", async () => {
  const repository = new Repository();
  const client = updateClient(repository);
  const scoped = await client.forRepository(7, 99);
  Object.assign(scoped.repository, { defaultBranch: VELVET_DATA_BRANCH });
  repository.files.set("velvet.yml", "schemaVersion: 1\nrepository: { owner: example, name: status }\nstatusPage: { name: S }\nservices:\n  - { name: W, url: https://example.com }\n");
  repository.files.set(
    "velvet.lock.json",
    `${JSON.stringify({
      schemaVersion: 1,
      installedVersion: "2.0.0",
      template: { repository: "phranck/velvet", commit: TEMPLATE_COMMIT_ONE },
      configurationSchemaVersion: 1,
      dataSchemaVersion: 1,
    })}\n`,
  );

  const updates = createManagedUpdateOrchestrator({
    github: { async forRepository() { return scoped; } },
    releases: createEmbeddedReleaseProvider(release("2.1.0", TEMPLATE_COMMIT_TWO)),
    requiredCheckNames: ["Validate managed update"],
    maxReadAttempts: 1,
    sleep: async () => {},
  });

  const outcome = await updates.reconcile({
    installationId: 7,
    repositoryId: 99,
    version: "2.1.0",
    trigger: "manual",
  });

  assert.equal(outcome.state, "failed");
  assert.equal(outcome.reason, "protected_branch_target");
  assert.equal(repository.branchHead, null, "nothing was created");
});
