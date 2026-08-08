import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "bun:test";

import {
  MANAGED_TEMPLATE_PATHS,
  parseVelvetVersionLock,
  type VelvetManagedFile,
  type VelvetReleaseManifest,
  type VelvetVersionLock,
} from "@velvet/contracts";

import { GitHubApiError } from "../src/github-api.js";
import {
  createManagedUpdateOrchestrator,
  type ManagedUpdateRelease,
} from "../src/update-orchestrator.js";
import type {
  GitHubManagedFile,
  GitHubRepositoryUpdateClient,
  GitHubUpdateCheckRun,
  GitHubUpdateClient,
  GitHubUpdatePullRequest,
  GitHubUpdateWorkflowRun,
} from "../src/update-github.js";
import {
  ManagedUpdateError,
  publicManagedUpdateError,
} from "../src/update-error.js";
import type { ManagedUpdateLogEntry } from "../src/update-orchestrator-types.js";
import { VELVET_DATA_BRANCH } from "../src/update-ownership.js";

const baseSha = "1".repeat(40);
const updateSha = "2".repeat(40);
const mergeSha = "3".repeat(40);
const revertSha = "4".repeat(40);
const dataSha = "5".repeat(40);
const rewrittenDataSha = "6".repeat(40);
const templateCommit = "a".repeat(40);

const configuration = (automaticSecurityUpdates = true) => `
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - { name: Website, url: https://example.com }
updates: { automaticSecurityUpdates: ${automaticSecurityUpdates} }
`;

const sources = {
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
  ".github/workflows/velvet-response-times.yml": monitorWorkflow("response"),
  ".github/workflows/velvet-status.yml": monitorWorkflow("status"),
  ".github/workflows/velvet.yml": monitorWorkflow("status"),
} as const;

function monitorWorkflow(mode: "response" | "status"): string {
  return `
name: Velvet ${mode}
on: { workflow_dispatch: {} }
jobs:
  monitor:
    steps:
      - uses: phranck/velvet/actions/monitor@${templateCommit}
        with: { mode: ${mode} }
`;
}

function hash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function sourceFile(
  path: keyof typeof sources,
  generator?: Exclude<
    VelvetManagedFile & { strategy: "generate" },
    { generator: "version-lock-v1" }
  >["generator"],
): VelvetManagedFile {
  return generator
    ? {
        path,
        strategy: "generate",
        generator,
        sourcePath: path,
        sha256: hash(sources[path]),
      }
    : {
        path,
        strategy: "replace",
        sourcePath: path,
        sha256: hash(sources[path]),
      };
}

function release(
  overrides: Partial<VelvetReleaseManifest> = {},
): ManagedUpdateRelease {
  const manifest: VelvetReleaseManifest = {
    schemaVersion: 1,
    version: "2.1.0",
    releaseType: "feature",
    automaticInstallEligible: false,
    template: {
      repository: "phranck/velvet",
      commit: templateCommit,
    },
    compatibility: {
      minimumInstalledVersion: "2.0.0",
      configurationSchemaVersion: 1,
      dataSchemaVersion: 1,
      configurationMigrationRequired: false,
      dataMigrationRequired: false,
    },
    managedFiles: [
      sourceFile(".github/ISSUE_TEMPLATE/config.yml"),
      sourceFile(
        ".github/ISSUE_TEMPLATE/maintenance.yml",
        "maintenance-issue-template-v1",
      ),
      sourceFile(".github/workflows/deploy-announce.yml"),
      sourceFile(
        ".github/workflows/maintenance-switch.yml",
        "maintenance-workflow-v1",
      ),
      sourceFile(
        ".github/workflows/velvet-response-times.yml",
        "response-times-workflow-v1",
      ),
      sourceFile(
        ".github/workflows/velvet-status.yml",
        "status-workflow-v1",
      ),
      sourceFile(".github/workflows/velvet.yml", "pages-workflow-v1"),
      {
        path: "velvet.lock.json",
        strategy: "generate",
        generator: "version-lock-v1",
      },
    ],
    releaseNotes: "# Velvet 2.1.0\n",
    ...overrides,
  };
  return { manifest, sources };
}

const previousLock: VelvetVersionLock = {
  schemaVersion: 1,
  installedVersion: "2.0.0",
  template: {
    repository: "phranck/velvet",
    commit: "b".repeat(40),
  },
  configurationSchemaVersion: 1,
  dataSchemaVersion: 1,
};

const previousFiles: GitHubManagedFile[] = MANAGED_TEMPLATE_PATHS.map((path) => ({
  path,
  content: path === "velvet.lock.json"
    ? `${JSON.stringify(previousLock, null, 2)}\n`
    : `previous ${path}\n`,
}));

class FakeRepository implements GitHubRepositoryUpdateClient {
  readonly repository = {
    id: 99,
    owner: "example",
    name: "status",
    defaultBranch: "main",
  };
  readonly mutations: string[] = [];
  readonly checkRunsBySha = new Map<string, GitHubUpdateCheckRun[]>();
  readonly workflowRunsBySha = new Map<string, GitHubUpdateWorkflowRun[]>();
  defaultHead = baseSha;
  branchHead: string | null = null;
  currentFiles = structuredClone(previousFiles);
  updateFiles: GitHubManagedFile[] | null = null;
  lock = structuredClone(previousLock);
  pullRequest: GitHubUpdatePullRequest | null = null;
  configurationSource = configuration();
  defaultHeadFailures = 0;
  defaultHeadCalls = 0;
  createPullRequestFailures = 0;
  changedPathsResult: string[] = [...MANAGED_TEMPLATE_PATHS];
  dataBranchSha: string | null = dataSha;
  dataBranchAfterMerge: string | null | undefined = undefined;

  async defaultBranchHead(): Promise<string> {
    this.defaultHeadCalls += 1;
    if (this.defaultHeadFailures > 0) {
      this.defaultHeadFailures -= 1;
      throw new GitHubApiError(new Response(null, { status: 503 }));
    }
    return this.defaultHead;
  }

  async readConfiguration(): Promise<{ source: string; blobSha: string }> {
    return { source: this.configurationSource, blobSha: "8".repeat(40) };
  }

  async readVersionLock(): Promise<{ lock: VelvetVersionLock; blobSha: string }> {
    return { lock: structuredClone(this.lock), blobSha: "9".repeat(40) };
  }

  async readManagedFiles(ref: string): Promise<GitHubManagedFile[]> {
    if (ref === baseSha) return structuredClone(previousFiles);
    if (ref === updateSha && this.updateFiles) {
      return structuredClone(this.updateFiles);
    }
    if (ref === this.defaultHead) return structuredClone(this.currentFiles);
    throw new Error(`Unexpected managed-files ref ${ref}`);
  }

  async changedPaths(pullRequestNumber: number): Promise<string[]> {
    assert.equal(pullRequestNumber, this.pullRequest?.number);
    return [...this.changedPathsResult];
  }

  async dataBranchHead(): Promise<string | null> {
    return this.dataBranchSha;
  }

  async updateBranchHead(): Promise<string | null> {
    return this.branchHead;
  }

  async createUpdateBranch(_version: string, expectedBaseSha: string): Promise<void> {
    assert.equal(expectedBaseSha, this.defaultHead);
    this.mutations.push("create-branch");
    this.branchHead = expectedBaseSha;
  }

  async commitUpdate(
    _version: string,
    expectedHeadSha: string,
    files: readonly GitHubManagedFile[],
  ): Promise<string> {
    assert.equal(expectedHeadSha, this.branchHead);
    this.mutations.push("commit-update");
    this.updateFiles = files.map((file) => ({ ...file }));
    this.branchHead = updateSha;
    return updateSha;
  }

  async createPullRequest(
    _version: string,
    expectedHeadSha: string,
    expectedBaseSha: string,
  ): Promise<GitHubUpdatePullRequest> {
    this.mutations.push("create-pr");
    if (this.createPullRequestFailures > 0) {
      this.createPullRequestFailures -= 1;
      throw new GitHubApiError(new Response(null, { status: 503 }));
    }
    this.pullRequest = {
      number: 12,
      state: "open",
      htmlUrl: "https://github.com/example/status/pull/12",
      headRef: "velvet/update/2.1.0",
      headSha: expectedHeadSha,
      baseRef: "main",
      baseSha: expectedBaseSha,
      mergedAt: null,
      mergeCommitSha: null,
    };
    return structuredClone(this.pullRequest);
  }

  async pullRequests(): Promise<GitHubUpdatePullRequest[]> {
    return this.pullRequest ? [structuredClone(this.pullRequest)] : [];
  }

  async checkRuns(headSha: string): Promise<GitHubUpdateCheckRun[]> {
    return structuredClone(this.checkRunsBySha.get(headSha) ?? []);
  }

  async pagesWorkflowRuns(headSha: string): Promise<GitHubUpdateWorkflowRun[]> {
    return structuredClone(this.workflowRunsBySha.get(headSha) ?? []);
  }

  async dispatchPagesWorkflow(expectedHeadSha: string): Promise<void> {
    assert.equal(expectedHeadSha, this.defaultHead);
    this.mutations.push(`dispatch:${expectedHeadSha}`);
    this.workflowRunsBySha.set(expectedHeadSha, [
      workflowRun(expectedHeadSha, "in_progress", null),
    ]);
  }

  async mergePullRequest(): Promise<{ merged: boolean; sha: string }> {
    assert.ok(this.pullRequest);
    assert.ok(this.updateFiles);
    this.mutations.push("merge");
    this.pullRequest = {
      ...this.pullRequest,
      state: "closed",
      mergedAt: "2026-07-31T12:00:00Z",
      mergeCommitSha: mergeSha,
    };
    this.defaultHead = mergeSha;
    this.currentFiles = structuredClone(this.updateFiles);
    this.lock = lockFrom(this.currentFiles);
    if (this.dataBranchAfterMerge !== undefined) {
      this.dataBranchSha = this.dataBranchAfterMerge;
    }
    return { merged: true, sha: mergeSha };
  }

  async deleteUpdateBranch(): Promise<void> {
    this.mutations.push("delete-branch");
    this.branchHead = null;
  }

  async commitRevert(
    _version: string,
    expectedHeadSha: string,
    files: readonly GitHubManagedFile[],
  ): Promise<string> {
    assert.equal(expectedHeadSha, this.defaultHead);
    this.mutations.push("revert");
    this.defaultHead = revertSha;
    this.currentFiles = files.map((file) => ({ ...file }));
    this.lock = lockFrom(this.currentFiles);
    return revertSha;
  }
}

function lockFrom(files: readonly GitHubManagedFile[]): VelvetVersionLock {
  const source = files.find((file) => file.path === "velvet.lock.json")?.content;
  assert.ok(source);
  const parsed = parseVelvetVersionLock(source);
  assert.equal(parsed.success, true);
  return parsed.success ? parsed.data : (null as never);
}

function checkRun(
  conclusion: string | null,
  status: GitHubUpdateCheckRun["status"] = "completed",
): GitHubUpdateCheckRun {
  return {
    id: 101,
    name: "Validate managed update",
    status,
    conclusion,
    htmlUrl: "https://github.com/example/status/actions/runs/101",
    headSha: updateSha,
  };
}

function workflowRun(
  headSha: string,
  status: GitHubUpdateWorkflowRun["status"],
  conclusion: string | null,
): GitHubUpdateWorkflowRun {
  return {
    id: Number(headSha[0]),
    status,
    conclusion,
    htmlUrl: `https://github.com/example/status/actions/runs/${headSha[0]}`,
    headSha,
  };
}

function orchestrator(
  repository: FakeRepository,
  selectedRelease: ManagedUpdateRelease = release(),
  overrides: { sleep?: (milliseconds: number) => Promise<void> } = {},
) {
  const github: GitHubUpdateClient = {
    async forRepository() {
      return repository;
    },
  };
  return createManagedUpdateOrchestrator({
    github,
    releases: {
      latest() {
        return selectedRelease.manifest.version;
      },
      async get(version) {
        assert.equal(version, selectedRelease.manifest.version);
        return selectedRelease;
      },
    },
    requiredCheckNames: ["Validate managed update"],
    maxReadAttempts: 3,
    ...(overrides.sleep ? { sleep: overrides.sleep } : {}),
  });
}

const manualRequest = {
  installationId: 7,
  repositoryId: 99,
  version: "2.1.0",
  trigger: "manual" as const,
};

test("reconciles one manual update from branch creation through published cleanup", async () => {
  const repository = new FakeRepository();
  const updates = orchestrator(repository);

  const prepared = await updates.reconcile(manualRequest);
  assert.equal(prepared.state, "waiting_for_checks");
  assert.equal(prepared.pullRequest?.number, 12);
  assert.deepEqual(repository.mutations, [
    "create-branch",
    "commit-update",
    "create-pr",
  ]);

  repository.checkRunsBySha.set(updateSha, [checkRun("success")]);
  const publishing = await updates.reconcile(manualRequest);
  assert.equal(publishing.state, "waiting_for_publication");
  assert.deepEqual(repository.mutations.slice(-2), [
    "merge",
    `dispatch:${mergeSha}`,
  ]);

  repository.workflowRunsBySha.set(mergeSha, [
    workflowRun(mergeSha, "completed", "success"),
  ]);
  const completed = await updates.reconcile(manualRequest);
  assert.equal(completed.state, "succeeded");
  assert.equal(repository.branchHead, null);

  const repeated = await updates.reconcile(manualRequest);
  assert.equal(repeated.state, "succeeded");
  assert.equal(
    repository.mutations.filter((mutation) => mutation === "create-pr").length,
    1,
  );
  assert.equal(
    repository.mutations.filter((mutation) => mutation.startsWith("dispatch:")).length,
    1,
  );
});

test("carries the installation's serial across an update", async () => {
  const repository = new FakeRepository();
  // The lock this installation already has, carrying the number it was issued.
  repository.currentFiles = repository.currentFiles.map((file) =>
    file.path === "velvet.lock.json"
      ? {
          path: file.path,
          content: `${JSON.stringify({ ...previousLock, serial: 412 }, null, 2)}\n`,
        }
      : file,
  );
  repository.lock = lockFrom(repository.currentFiles);

  const updates = orchestrator(repository);
  await updates.reconcile(manualRequest);

  // Every other field of the lock is rebuilt from the release being installed.
  // This one describes the installation, so an update that regenerated it would
  // silently take the number off a page that had been showing it.
  assert.ok(repository.updateFiles, "the update wrote its files");
  const written = lockFrom(repository.updateFiles);
  assert.equal(written.installedVersion, "2.1.0");
  assert.equal(written.serial, 412);
});

test("leaves the lock without a serial when the installation never had one", async () => {
  const repository = new FakeRepository();
  const updates = orchestrator(repository);
  await updates.reconcile(manualRequest);

  assert.ok(repository.updateFiles, "the update wrote its files");
  const written = lockFrom(repository.updateFiles);
  assert.equal("serial" in written, false);
});

test("does not start an automatic update when the user disabled it or the release is not safe", async () => {
  const disabledRepository = new FakeRepository();
  disabledRepository.configurationSource = configuration(false);
  const disabled = await orchestrator(
    disabledRepository,
    release({
      version: "2.0.1",
      releaseType: "security",
      automaticInstallEligible: true,
    }),
  ).reconcile({
    ...manualRequest,
    version: "2.0.1",
    trigger: "automatic-security",
  });
  assert.equal(disabled.state, "skipped");
  assert.equal(disabled.reason, "automatic_security_disabled");
  assert.deepEqual(disabledRepository.mutations, []);

  const unsafeRepository = new FakeRepository();
  const unsafe = await orchestrator(unsafeRepository).reconcile({
    ...manualRequest,
    trigger: "automatic-security",
  });
  assert.equal(unsafe.state, "skipped");
  assert.equal(unsafe.reason, "release_not_automatic");
  assert.deepEqual(unsafeRepository.mutations, []);
});

test("keeps a failed automatic update as terminal repository state", async () => {
  const repository = new FakeRepository();
  const automaticRelease = release({
    version: "2.0.1",
    releaseType: "security",
    automaticInstallEligible: true,
  });
  const updates = orchestrator(repository, automaticRelease);
  const request = {
    ...manualRequest,
    version: "2.0.1",
    trigger: "automatic-security" as const,
  };

  assert.equal((await updates.reconcile(request)).state, "waiting_for_checks");
  repository.checkRunsBySha.set(updateSha, [checkRun("failure")]);
  assert.equal((await updates.reconcile(request)).state, "failed");
  assert.equal((await updates.reconcile(request)).state, "failed");
  assert.deepEqual(repository.mutations, [
    "create-branch",
    "commit-update",
    "create-pr",
  ]);
});

test("restores and republishes the previous managed version after publication fails", async () => {
  const repository = new FakeRepository();
  const updates = orchestrator(repository);

  await updates.reconcile(manualRequest);
  repository.checkRunsBySha.set(updateSha, [checkRun("success")]);
  await updates.reconcile(manualRequest);
  repository.workflowRunsBySha.set(mergeSha, [
    workflowRun(mergeSha, "completed", "failure"),
  ]);

  const restoring = await updates.reconcile(manualRequest);
  assert.equal(restoring.state, "restoring");
  assert.equal(repository.mutations.filter((entry) => entry === "revert").length, 1);

  const republishing = await updates.reconcile(manualRequest);
  assert.equal(republishing.state, "waiting_for_recovery");
  assert.equal(repository.mutations.at(-1), `dispatch:${revertSha}`);

  repository.workflowRunsBySha.set(revertSha, [
    workflowRun(revertSha, "completed", "success"),
  ]);
  assert.equal((await updates.reconcile(manualRequest)).state, "restored");
  assert.equal((await updates.reconcile(manualRequest)).state, "restored");
  assert.equal(repository.mutations.filter((entry) => entry === "revert").length, 1);
});

test("refuses a repository whose default branch stores the generated history", async () => {
  const repository = new FakeRepository();
  repository.repository.defaultBranch = VELVET_DATA_BRANCH;

  const outcome = await orchestrator(repository).reconcile(manualRequest);

  assert.equal(outcome.state, "failed");
  assert.equal(outcome.reason, "protected_branch_target");
  assert.deepEqual(repository.mutations, []);
});

test("stops an update before merging a pull request that changes protected files", async () => {
  const repository = new FakeRepository();
  const updates = orchestrator(repository);
  assert.equal((await updates.reconcile(manualRequest)).state, "waiting_for_checks");
  repository.checkRunsBySha.set(updateSha, [checkRun("success")]);
  repository.changedPathsResult = [
    ".github/workflows/velvet.yml",
    "velvet.lock.json",
    "velvet.yml",
  ];

  const blocked = await updates.reconcile(manualRequest);

  assert.equal(blocked.state, "failed");
  assert.equal(blocked.reason, "protected_files_changed");
  assert.equal(repository.mutations.includes("merge"), false);
  assert.deepEqual(repository.currentFiles, previousFiles);
  assert.equal(repository.defaultHead, baseSha);
});

test("stops an update that removed the generated data branch whilst merging", async () => {
  const repository = new FakeRepository();
  repository.dataBranchAfterMerge = null;
  const updates = orchestrator(repository);
  await updates.reconcile(manualRequest);
  repository.checkRunsBySha.set(updateSha, [checkRun("success")]);

  const outcome = await updates.reconcile(manualRequest);

  assert.equal(outcome.state, "failed");
  assert.equal(outcome.reason, "data_branch_changed");
  assert.equal(
    repository.mutations.some((mutation) => mutation.startsWith("dispatch:")),
    false,
  );
  assert.equal(repository.mutations.includes("delete-branch"), false);
});

test("accepts a data branch that the monitor rewrote whilst the update merged", async () => {
  const repository = new FakeRepository();
  repository.dataBranchAfterMerge = rewrittenDataSha;
  const updates = orchestrator(repository);
  await updates.reconcile(manualRequest);
  repository.checkRunsBySha.set(updateSha, [checkRun("success")]);

  const outcome = await updates.reconcile(manualRequest);

  assert.equal(outcome.state, "waiting_for_publication");
  assert.deepEqual(repository.mutations.slice(-2), [
    "merge",
    `dispatch:${mergeSha}`,
  ]);
});

test("retries safe GitHub reads only up to the configured bound", async () => {
  const repository = new FakeRepository();
  repository.defaultHeadFailures = 2;
  const delays: number[] = [];
  const updates = orchestrator(repository, release(), {
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  assert.equal((await updates.reconcile(manualRequest)).state, "waiting_for_checks");
  assert.equal(repository.defaultHeadCalls, 3);
  assert.deepEqual(delays, [250, 500]);
});

test("does not retry a failed mutation and resumes from its committed branch", async () => {
  const repository = new FakeRepository();
  repository.createPullRequestFailures = 1;
  const updates = orchestrator(repository);

  await assert.rejects(
    () => updates.reconcile(manualRequest),
    /GitHub was temporarily unavailable/u,
  );
  assert.equal(
    repository.mutations.filter((mutation) => mutation === "create-pr").length,
    1,
    "a failed mutation is never retried automatically",
  );

  const resumed = await updates.reconcile(manualRequest);
  assert.equal(resumed.state, "waiting_for_checks");
  assert.equal(
    repository.mutations.filter((mutation) => mutation === "create-branch").length,
    1,
  );
  assert.equal(
    repository.mutations.filter((mutation) => mutation === "commit-update").length,
    1,
  );
  assert.equal(
    repository.mutations.filter((mutation) => mutation === "create-pr").length,
    2,
  );
});

test("stops retrying a safe read after the configured attempt limit", async () => {
  const repository = new FakeRepository();
  repository.defaultHeadFailures = 4;
  const delays: number[] = [];
  const updates = orchestrator(repository, release(), {
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  await assert.rejects(
    () => updates.reconcile(manualRequest),
    /GitHub was temporarily unavailable/u,
  );
  assert.equal(repository.defaultHeadCalls, 3);
  assert.deepEqual(delays, [250, 500]);
  assert.deepEqual(repository.mutations, []);
});

test("reports a stable code, a safe message, and an error id at the boundary", async () => {
  const repository = new FakeRepository();
  repository.defaultHeadFailures = 9;
  const entries: ManagedUpdateLogEntry[] = [];
  const github: GitHubUpdateClient = {
    async forRepository() {
      return repository;
    },
  };
  const updates = createManagedUpdateOrchestrator({
    github,
    releases: {
      latest: () => "2.1.0",
      async get() {
        return release();
      },
    },
    requiredCheckNames: ["Validate managed update"],
    maxReadAttempts: 1,
    sleep: async () => {},
    log: (entry) => entries.push(entry),
    errorId: () => "E".repeat(32),
  });

  const failure = await updates.reconcile(manualRequest).then(
    () => null,
    (error: unknown) => error,
  );

  assert.equal(failure instanceof ManagedUpdateError, true);
  const error = failure as ManagedUpdateError;
  assert.equal(error.code, "UPDATE_GITHUB_UNAVAILABLE");
  assert.equal(error.errorId, "E".repeat(32));
  assert.equal(error.retryable, true);
  assert.deepEqual(publicManagedUpdateError(error), {
    code: "UPDATE_GITHUB_UNAVAILABLE",
    message: "GitHub was temporarily unavailable. Try again shortly.",
    errorId: "E".repeat(32),
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.code, "UPDATE_GITHUB_UNAVAILABLE");
  assert.equal(entries[0]?.repositoryId, 99);
  assert.equal(entries[0]?.outcome, "failed");
});

test("keeps the public error free of anything the caller must not see", async () => {
  const repository = new FakeRepository();
  repository.configurationSource = "not: [valid";
  const updates = orchestrator(repository);

  const failure = await updates.reconcile(manualRequest).then(
    () => null,
    (error: unknown) => error,
  );

  const error = failure as ManagedUpdateError;
  assert.equal(error.code, "UPDATE_INSTALLATION_INVALID");
  const published = JSON.stringify(publicManagedUpdateError(error));
  for (const secret of ["not: [valid", "example", "status", "installation-token"]) {
    assert.equal(
      published.includes(secret),
      false,
      `the public error must not carry ${secret}`,
    );
  }
  assert.equal(error.errorId.length > 0, true);
});

test("waits for a created branch that GitHub has not published yet", async () => {
  // GitHub answers the single-ref read with 404 for a moment after a ref is
  // created, and the client reports that as an absent branch rather than as a
  // failure, so the retry around safe reads never sees it. Without waiting,
  // an update fails with `repository_changed` whilst nothing has changed.
  const repository = new FakeRepository();
  let invisible = 3;
  const branchHead = repository.updateBranchHead.bind(repository);
  repository.updateBranchHead = async () => {
    const head = await branchHead();
    if (head !== null && invisible > 0) {
      invisible -= 1;
      return null;
    }
    return head;
  };
  const slept: number[] = [];
  const managed = orchestrator(repository, release(), {
    sleep: async (milliseconds) => {
      slept.push(milliseconds);
    },
  });

  const result = await managed.reconcile(manualRequest);

  assert.equal(result.state, "waiting_for_checks");
  assert.equal(invisible, 0, "the branch was read until it appeared");
  assert.equal(slept.length > 0, true, "it waited rather than spinning");
  assert.deepEqual(repository.mutations, [
    "create-branch",
    "commit-update",
    "create-pr",
  ]);
});

test("gives up on a branch that never appears", async () => {
  const repository = new FakeRepository();
  repository.updateBranchHead = async () => null;
  const managed = orchestrator(repository, release(), { sleep: async () => {} });

  const result = await managed.reconcile(manualRequest);

  assert.equal(result.state, "failed");
  assert.equal(result.reason, "repository_changed");
});

test("finishes an update whose merged pull request names no commit", async () => {
  // The list endpoint omits `merge_commit_sha`, so keying the merged decision
  // on it reported a finished update as one somebody had closed.
  const repository = new FakeRepository();
  repository.pullRequest = {
    number: 12,
    state: "closed",
    htmlUrl: "https://github.com/example/status/pull/12",
    headRef: "velvet/update/2.1.0",
    headSha: updateSha,
    baseRef: "main",
    baseSha,
    mergedAt: "2026-08-01T12:00:00Z",
    mergeCommitSha: null,
  };
  const managed = orchestrator(repository, release(), { sleep: async () => {} });

  const result = await managed.reconcile(manualRequest);

  assert.notEqual(result.reason, "update_closed");
});

test("prepares a fresh attempt after an update somebody closed", async () => {
  // A closed pull request describes an earlier attempt, not this one. Treated
  // as an outcome it left the version permanently uninstallable: the interface
  // reported `update_closed` on every further press, and reopening the pull
  // request would only have restored the state that had already failed.
  const repository = new FakeRepository();
  repository.pullRequest = {
    number: 12,
    state: "closed",
    htmlUrl: "https://github.com/example/status/pull/12",
    headRef: "velvet/update/2.1.0",
    headSha: updateSha,
    baseRef: "main",
    baseSha,
    mergedAt: null,
    mergeCommitSha: null,
  };
  repository.branchHead = null;
  const managed = orchestrator(repository, release(), { sleep: async () => {} });

  const result = await managed.reconcile(manualRequest);

  assert.notEqual(result.reason, "update_closed");
  assert.deepEqual(repository.mutations, [
    "create-branch",
    "commit-update",
    "create-pr",
  ]);
});

test("starts over when the default branch moved under an open update", async () => {
  // Anything writing to the default branch whilst an update is open leaves the
  // pull request cut from a commit that is no longer the head, and this service
  // writes its own preferences there. Failing was unrecoverable, because the
  // pull request could then neither be reconciled nor replaced.
  const repository = new FakeRepository();
  repository.pullRequest = {
    number: 12,
    state: "open",
    htmlUrl: "https://github.com/example/status/pull/12",
    headRef: "velvet/update/2.1.0",
    headSha: updateSha,
    baseRef: "main",
    baseSha: "0000000000000000000000000000000000000000",
    mergedAt: null,
    mergeCommitSha: null,
  };
  // The branch this pull request carries holds what the release ships, so the
  // only thing wrong with it is the commit it was cut from.
  repository.updateFiles = structuredClone(previousFiles);
  const managed = orchestrator(repository, release(), { sleep: async () => {} });

  const result = await managed.reconcile(manualRequest);

  assert.notEqual(result.reason, "repository_changed");
  // The stale branch goes first, which closes its pull request with it, and the
  // attempt is built again from where the repository actually stands.
  assert.equal(repository.mutations[0], "delete-branch");
  assert.equal(repository.mutations.includes("create-pr"), true);
});
