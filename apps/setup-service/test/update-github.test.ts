import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { test } from "bun:test";

import {
  MANAGED_TEMPLATE_PATHS,
  type VelvetVersionLock,
} from "@velvet/contracts";

import {
  createGitHubUpdateClient,
  updateBranchName,
  type GitHubManagedFile,
} from "../src/update-github.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2_048 });
const privateKeyPem = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

const baseSha = "1".repeat(40);
const updateSha = "2".repeat(40);
const mergeSha = "3".repeat(40);
const revertSha = "4".repeat(40);
const baseTreeSha = "5".repeat(40);
const updateTreeSha = "6".repeat(40);
const revertTreeSha = "7".repeat(40);

const lock: VelvetVersionLock = {
  schemaVersion: 1,
  installedVersion: "2.0.5",
  template: {
    repository: "phranck/velvet",
    commit: "a".repeat(40),
  },
  configurationSchemaVersion: 1,
  dataSchemaVersion: 1,
};

const managedFiles: GitHubManagedFile[] = MANAGED_TEMPLATE_PATHS.map(
  (path) => ({ path, content: `content for ${path}\n` }),
);

function app(fetch: (request: Request) => Promise<Response>) {
  return createGitHubUpdateClient({
    appId: "12345",
    privateKey: privateKeyPem,
    nowSeconds: () => 1_000_000,
    fetch,
  });
}

function repositoryResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 99,
    name: "status",
    full_name: "example/status",
    default_branch: "main",
    owner: { login: "example", id: 42 },
    ...overrides,
  };
}

test("mints the minimum repository-restricted update token", async () => {
  const requests: Request[] = [];
  const client = app(async (request) => {
    requests.push(request);
    if (requests.length === 1) {
      return Response.json({ token: "installation-token" });
    }
    return Response.json(repositoryResponse());
  });

  const repository = await client.forRepository(7, 99);

  assert.deepEqual(repository.repository, {
    id: 99,
    owner: "example",
    name: "status",
    defaultBranch: "main",
  });
  assert.equal(
    requests[0]?.url,
    "https://api.github.com/app/installations/7/access_tokens",
  );
  assert.deepEqual(await requests[0]!.json(), {
    repository_ids: [99],
    permissions: {
      actions: "write",
      checks: "read",
      contents: "write",
      pull_requests: "write",
      workflows: "write",
    },
  });
  assert.equal(requests[1]?.url, "https://api.github.com/repositories/99");
  assert.equal(
    requests.every(
      (request) =>
        request.headers.get("Authorization") === "Bearer installation-token" ||
        request.url.includes("/access_tokens"),
    ),
    true,
  );
});

test("performs the closed update branch, pull request, check, merge, cleanup, and revert flow", async () => {
  const requests: Request[] = [];
  let treeCalls = 0;
  let commitCalls = 0;
  let mainRefCalls = 0;
  let updateRefCalls = 0;
  const client = app(async (request) => {
    requests.push(request);
    const url = new URL(request.url);
    const path = url.pathname;
    if (path.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (path === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    if (
      path.endsWith("/contents/velvet.lock.json") &&
      url.searchParams.get("ref") === "main"
    ) {
      return Response.json({
        type: "file",
        encoding: "base64",
        content: Buffer.from(`${JSON.stringify(lock)}\n`).toString("base64"),
        size: Buffer.byteLength(JSON.stringify(lock)) + 1,
        sha: "8".repeat(40),
      });
    }
    if (path.includes("/contents/")) {
      const managedPath = decodeURIComponent(path.split("/contents/")[1]!);
      const file = managedFiles.find((entry) => entry.path === managedPath);
      const source = managedPath === "velvet.yml"
        ? "schemaVersion: 1\n"
        : file?.content;
      if (source === undefined) {
        throw new Error(`Unexpected content path: ${managedPath}`);
      }
      return Response.json({
        type: "file",
        encoding: "base64",
        content: Buffer.from(source).toString("base64"),
        size: Buffer.byteLength(source),
        sha: "8".repeat(40),
      });
    }
    if (request.method === "POST" && path.endsWith("/git/refs")) {
      return Response.json({
        ref: "refs/heads/velvet/update/2.1.0",
        object: { type: "commit", sha: baseSha },
      });
    }
    if (request.method === "GET" && path.includes("/git/ref/heads/")) {
      const isMain = path.endsWith("/main");
      if (isMain) {
        mainRefCalls += 1;
      } else {
        updateRefCalls += 1;
      }
      const sha = isMain
        ? mainRefCalls > 1 ? mergeSha : baseSha
        : updateRefCalls > 1 ? updateSha : baseSha;
      return Response.json({
        ref: isMain
          ? "refs/heads/main"
          : "refs/heads/velvet/update/2.1.0",
        object: { type: "commit", sha },
      });
    }
    if (request.method === "GET" && path.includes("/git/commits/")) {
      return Response.json({ sha: path.endsWith(mergeSha) ? mergeSha : baseSha, tree: { sha: baseTreeSha } });
    }
    if (request.method === "POST" && path.endsWith("/git/trees")) {
      treeCalls += 1;
      return Response.json({ sha: treeCalls === 1 ? updateTreeSha : revertTreeSha });
    }
    if (request.method === "POST" && path.endsWith("/git/commits")) {
      commitCalls += 1;
      return Response.json({ sha: commitCalls === 1 ? updateSha : revertSha });
    }
    if (request.method === "PATCH" && path.includes("/git/refs/heads/")) {
      return Response.json({
        ref: path.endsWith("/main")
          ? "refs/heads/main"
          : "refs/heads/velvet/update/2.1.0",
        object: {
          type: "commit",
          sha: path.endsWith("/main") ? revertSha : updateSha,
        },
      });
    }
    if (request.method === "POST" && path.endsWith("/pulls")) {
      return Response.json({
        number: 12,
        state: "open",
        html_url: "https://github.com/example/status/pull/12",
        merged_at: null,
        merge_commit_sha: null,
        head: { ref: "velvet/update/2.1.0", sha: updateSha },
        base: { ref: "main", sha: baseSha },
      });
    }
    if (request.method === "GET" && path.endsWith("/pulls")) {
      return Response.json([
        {
          number: 12,
          state: "open",
          html_url: "https://github.com/example/status/pull/12",
          merged_at: null,
          merge_commit_sha: null,
          head: { ref: "velvet/update/2.1.0", sha: updateSha },
          base: { ref: "main", sha: baseSha },
        },
      ]);
    }
    if (request.method === "GET" && path.endsWith("/pulls/12")) {
      return Response.json({
        number: 12,
        state: "open",
        html_url: "https://github.com/example/status/pull/12",
        merged_at: null,
        merge_commit_sha: null,
        head: { ref: "velvet/update/2.1.0", sha: updateSha },
        base: { ref: "main", sha: baseSha },
      });
    }
    if (request.method === "GET" && path.endsWith(`/commits/${updateSha}/check-runs`)) {
      return Response.json({
        total_count: 2,
        check_runs: [
          {
            id: 101,
            name: "lint",
            status: "completed",
            conclusion: "success",
            html_url: "https://github.com/example/status/actions/runs/1",
            head_sha: updateSha,
          },
          {
            id: 102,
            name: "build",
            status: "in_progress",
            conclusion: null,
            html_url: "https://github.com/example/status/actions/runs/2",
            head_sha: updateSha,
          },
        ],
      });
    }
    if (request.method === "PUT" && path.endsWith("/pulls/12/merge")) {
      return Response.json({ sha: mergeSha, merged: true, message: "Pull Request successfully merged" });
    }
    if (
      request.method === "DELETE" &&
      path.endsWith("/git/refs/heads/velvet/update/2.1.0")
    ) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  });
  const repository = await client.forRepository(7, 99);

  assert.equal(await repository.defaultBranchHead(), baseSha);
  assert.deepEqual(await repository.readConfiguration(), {
    source: "schemaVersion: 1\n",
    blobSha: "8".repeat(40),
  });
  assert.deepEqual(await repository.readVersionLock(), {
    lock,
    blobSha: "8".repeat(40),
  });
  assert.deepEqual(await repository.readManagedFiles(baseSha), managedFiles);
  assert.equal(updateBranchName("2.1.0"), "velvet/update/2.1.0");
  await repository.createUpdateBranch("2.1.0", baseSha);
  assert.equal(
    await repository.commitUpdate("2.1.0", baseSha, managedFiles),
    updateSha,
  );
  assert.deepEqual(await repository.createPullRequest("2.1.0", updateSha, baseSha), {
    number: 12,
    state: "open",
    htmlUrl: "https://github.com/example/status/pull/12",
    headRef: "velvet/update/2.1.0",
    headSha: updateSha,
    baseRef: "main",
    baseSha,
    mergedAt: null,
    mergeCommitSha: null,
  });
  assert.equal((await repository.pullRequests("2.1.0")).length, 1);
  assert.deepEqual(await repository.checkRuns(updateSha), [
    {
      id: 101,
      name: "lint",
      status: "completed",
      conclusion: "success",
      htmlUrl: "https://github.com/example/status/actions/runs/1",
      headSha: updateSha,
    },
    {
      id: 102,
      name: "build",
      status: "in_progress",
      conclusion: null,
      htmlUrl: "https://github.com/example/status/actions/runs/2",
      headSha: updateSha,
    },
  ]);
  assert.deepEqual(await repository.mergePullRequest(12, "2.1.0", updateSha), {
    merged: true,
    sha: mergeSha,
  });
  await repository.deleteUpdateBranch("2.1.0", updateSha);
  assert.equal(
    await repository.commitRevert("2.1.0", mergeSha, managedFiles),
    revertSha,
  );

  const createRef = requests.find(
    (request) => request.method === "POST" && request.url.endsWith("/git/refs"),
  );
  assert.deepEqual(await createRef!.json(), {
    ref: "refs/heads/velvet/update/2.1.0",
    sha: baseSha,
  });
  const trees = requests.filter(
    (request) => request.method === "POST" && request.url.endsWith("/git/trees"),
  );
  assert.equal(trees.length, 2);
  for (const request of trees) {
    const body = (await request.json()) as { base_tree: string; tree: unknown[] };
    assert.equal(body.base_tree, baseTreeSha);
    assert.deepEqual(
      body.tree.map((entry) => (entry as { path: string }).path),
      MANAGED_TEMPLATE_PATHS,
    );
  }
  const merges = requests.filter((request) => request.url.endsWith("/pulls/12/merge"));
  assert.deepEqual(await merges[0]!.json(), {
    sha: updateSha,
    merge_method: "squash",
    commit_title: "Update Velvet to 2.1.0",
  });
  const refUpdates = requests.filter(
    (request) => request.method === "PATCH" && request.url.includes("/git/refs/heads/"),
  );
  assert.deepEqual(await refUpdates[0]!.json(), { sha: updateSha, force: false });
  assert.deepEqual(await refUpdates[1]!.json(), { sha: revertSha, force: false });
});

test("rejects protected or incomplete writes before creating Git objects", async () => {
  const requests: Request[] = [];
  const client = app(async (request) => {
    requests.push(request);
    if (request.url.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    return Response.json(repositoryResponse());
  });
  const repository = await client.forRepository(7, 99);

  for (const files of [
    [...managedFiles.slice(1)],
    [...managedFiles, { path: "velvet.yml", content: "protected\n" }],
  ]) {
    await assert.rejects(
      () => repository.commitUpdate("2.1.0", baseSha, files),
      /complete Velvet-owned file set/u,
    );
  }
  assert.equal(requests.length, 2);
});

test("rejects repository metadata that does not match the scoped ID", async () => {
  const client = app(async (request) =>
    request.url.endsWith("/access_tokens")
      ? Response.json({ token: "installation-token" })
      : Response.json(repositoryResponse({ id: 100 })),
  );

  await assert.rejects(
    () => client.forRepository(7, 99),
    /update repository response was invalid/u,
  );
});

test("stops a stale update before creating a replacement tree", async () => {
  const requests: Request[] = [];
  const client = app(async (request) => {
    requests.push(request);
    if (request.url.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (request.url.endsWith("/repositories/99")) {
      return Response.json(repositoryResponse());
    }
    return Response.json({
      ref: "refs/heads/velvet/update/2.1.0",
      object: { type: "commit", sha: "9".repeat(40) },
    });
  });
  const repository = await client.forRepository(7, 99);

  await assert.rejects(
    () => repository.commitUpdate("2.1.0", baseSha, managedFiles),
    /branch changed before Velvet could commit/u,
  );
  assert.equal(requests.length, 3);
});

test("does not delete an update branch after its head changed", async () => {
  const requests: Request[] = [];
  const client = app(async (request) => {
    requests.push(request);
    if (request.url.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (request.url.endsWith("/repositories/99")) {
      return Response.json(repositoryResponse());
    }
    if (request.method === "GET" && request.url.includes("/git/ref/heads/")) {
      return Response.json({
        ref: "refs/heads/velvet/update/2.1.0",
        object: { type: "commit", sha: "9".repeat(40) },
      });
    }
    if (request.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  });
  const repository = await client.forRepository(7, 99);
  await assert.rejects(
    () => repository.deleteUpdateBranch("2.1.0", updateSha),
    /branch changed before Velvet could delete/u,
  );
  assert.equal(requests.some((request) => request.method === "DELETE"), false);
});

test("finds update branches and dispatches one Pages workflow for the expected default head", async () => {
  const requests: Request[] = [];
  const client = app(async (request) => {
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (url.pathname === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    if (
      request.method === "GET" &&
      url.pathname.endsWith("/git/ref/heads/velvet/update/2.1.0")
    ) {
      return Response.json({
        ref: "refs/heads/velvet/update/2.1.0",
        object: { type: "commit", sha: updateSha },
      });
    }
    if (
      request.method === "GET" &&
      url.pathname.endsWith("/actions/workflows/velvet.yml/runs")
    ) {
      assert.equal(url.searchParams.get("event"), "workflow_dispatch");
      assert.equal(url.searchParams.get("head_sha"), mergeSha);
      return Response.json({
        total_count: 1,
        workflow_runs: [
          {
            id: 501,
            event: "workflow_dispatch",
            head_sha: mergeSha,
            status: "in_progress",
            conclusion: null,
            html_url: "https://github.com/example/status/actions/runs/501",
          },
        ],
      });
    }
    if (
      request.method === "GET" &&
      url.pathname.endsWith("/git/ref/heads/main")
    ) {
      return Response.json({
        ref: "refs/heads/main",
        object: { type: "commit", sha: mergeSha },
      });
    }
    if (
      request.method === "POST" &&
      url.pathname.endsWith("/actions/workflows/velvet.yml/dispatches")
    ) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  });
  const repository = await client.forRepository(7, 99);

  assert.equal(await repository.updateBranchHead("2.1.0"), updateSha);
  assert.deepEqual(await repository.pagesWorkflowRuns(mergeSha), [
    {
      id: 501,
      status: "in_progress",
      conclusion: null,
      htmlUrl: "https://github.com/example/status/actions/runs/501",
      headSha: mergeSha,
    },
  ]);
  await repository.dispatchPagesWorkflow(mergeSha);

  const dispatch = requests.find(
    (request) => request.method === "POST" && request.url.endsWith("/dispatches"),
  );
  assert.deepEqual(await dispatch!.json(), { ref: "main" });
});

test("reads both sides of every path a managed update pull request changes", async () => {
  const requests: Request[] = [];
  const client = app(async (request) => {
    requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (url.pathname === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    if (request.method === "GET" && url.pathname.endsWith("/pulls/12/files")) {
      return Response.json([
        { filename: ".github/workflows/velvet.yml", status: "modified" },
        { filename: "velvet.lock.json", status: "modified" },
        {
          filename: ".github/workflows/velvet-status.yml",
          status: "renamed",
          previous_filename: "velvet.yml",
        },
      ]);
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  });
  const repository = await client.forRepository(7, 99);

  assert.deepEqual(await repository.changedPaths(12), [
    ".github/workflows/velvet.yml",
    "velvet.lock.json",
    ".github/workflows/velvet-status.yml",
    "velvet.yml",
  ]);
  const files = requests.find((request) => request.url.includes("/pulls/12/files"));
  assert.equal(
    Number(new URL(files!.url).searchParams.get("per_page")),
    MANAGED_TEMPLATE_PATHS.length + 2,
    "a change set larger than the owned set must show a violation on the first page",
  );
});

test("rejects a changed-file response that does not name every path", async () => {
  const client = app(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (url.pathname === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    return Response.json([{ status: "modified", previous_filename: 7 }]);
  });
  const repository = await client.forRepository(7, 99);

  await assert.rejects(
    () => repository.changedPaths(12),
    /changed-files response was invalid/u,
  );
});

test("reports the generated data branch head and its absence", async () => {
  const present = app(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (url.pathname === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    if (url.pathname.endsWith("/git/ref/heads/velvet-data")) {
      return Response.json({
        ref: "refs/heads/velvet-data",
        object: { type: "commit", sha: mergeSha },
      });
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  });
  assert.equal(
    await (await present.forRepository(7, 99)).dataBranchHead(),
    mergeSha,
  );

  const absent = app(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (url.pathname === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    return new Response(null, { status: 404 });
  });
  assert.equal(
    await (await absent.forRepository(7, 99)).dataBranchHead(),
    null,
  );
});

test("keeps the merge commit needed to reconcile a completed update", async () => {
  const client = app(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (url.pathname === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    if (request.method === "GET" && url.pathname.endsWith("/pulls")) {
      return Response.json([
        {
          number: 12,
          state: "closed",
          html_url: "https://github.com/example/status/pull/12",
          merged_at: "2026-07-31T12:00:00Z",
          merge_commit_sha: mergeSha,
          head: { ref: "velvet/update/2.1.0", sha: updateSha },
          base: { ref: "main", sha: baseSha },
        },
      ]);
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  });
  const repository = await client.forRepository(7, 99);

  assert.deepEqual(await repository.pullRequests("2.1.0"), [
    {
      number: 12,
      state: "closed",
      htmlUrl: "https://github.com/example/status/pull/12",
      headRef: "velvet/update/2.1.0",
      headSha: updateSha,
      baseRef: "main",
      baseSha,
      mergedAt: "2026-07-31T12:00:00Z",
      mergeCommitSha: mergeSha,
    },
  ]);
});

test("accepts the test-merge commit GitHub reports on an open pull request", async () => {
  const client = app(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (url.pathname === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    return Response.json([
      {
        number: 12,
        state: "open",
        html_url: "https://github.com/example/status/pull/12",
        // GitHub computes a merge candidate and reports it here even while the
        // pull request is open. Only merged_at says a merge actually happened.
        merged_at: null,
        merge_commit_sha: mergeSha,
        head: { ref: "velvet/update/2.1.0", sha: updateSha },
        base: { ref: "main", sha: baseSha },
      },
    ]);
  });
  const repository = await client.forRepository(7, 99);

  const [pullRequest] = await repository.pullRequests("2.1.0");

  assert.equal(pullRequest?.state, "open");
  assert.equal(pullRequest?.mergedAt, null);
  assert.equal(pullRequest?.mergeCommitSha, mergeSha);
});

test("accepts the merged pull request the list endpoint actually returns", async () => {
  // Observed against real GitHub: the list representation carries `merged_at`
  // for a merged pull request and omits `merge_commit_sha` altogether.
  // Requiring the two together rejected every merged pull request Velvet reads
  // back after merging one, so an update that had already succeeded reported
  // that it could not be completed.
  const client = app(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (url.pathname === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    return Response.json([
      {
        number: 12,
        state: "closed",
        html_url: "https://github.com/example/status/pull/12",
        merged_at: "2026-08-01T12:00:00Z",
        head: { ref: "velvet/update/2.1.0", sha: updateSha },
        base: { ref: "main", sha: baseSha },
      },
    ]);
  });
  const repository = await client.forRepository(7, 99);

  const [pullRequest] = await repository.pullRequests("2.1.0");

  assert.equal(pullRequest?.state, "closed");
  assert.equal(pullRequest?.mergedAt, "2026-08-01T12:00:00Z");
  assert.equal(pullRequest?.mergeCommitSha, null);
});

test("accepts a freshly created pull request that omits its merge fields", async () => {
  const client = app(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (url.pathname === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    // GitHub omits merge_commit_sha entirely on a freshly created pull
    // request rather than sending null, which is what a real POST returns.
    return Response.json({
      number: 12,
      state: "open",
      html_url: "https://github.com/example/status/pull/12",
      merged_at: null,
      head: { ref: "velvet/update/2.1.0", sha: updateSha },
      base: { ref: "main", sha: baseSha },
    });
  });
  const repository = await client.forRepository(7, 99);

  const pullRequest = await repository.createPullRequest("2.1.0", updateSha, baseSha);

  assert.equal(pullRequest.state, "open");
  assert.equal(pullRequest.mergedAt, null);
  assert.equal(
    pullRequest.mergeCommitSha,
    null,
    "an absent field is normalised to null for callers",
  );
});

test("commits to a branch GitHub has not published to its ref endpoint yet", async () => {
  // Observed against real GitHub: the single-ref endpoint answers 404 for a
  // short window after a ref is created, which is not the same as the branch
  // being gone. Treating it as gone made an update fail immediately after
  // creating its own branch.
  let refReads = 0;
  const treeSha = "d".repeat(40);
  const client = app(async (request) => {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/access_tokens")) {
      return Response.json({ token: "installation-token" });
    }
    if (url.pathname === "/repositories/99") {
      return Response.json(repositoryResponse());
    }
    if (url.pathname.includes("/git/ref/heads/")) {
      refReads += 1;
      return refReads < 3
        ? new Response("{}", { status: 404 })
        : Response.json({
            ref: "refs/heads/velvet/update/2.1.0",
            object: { type: "commit", sha: baseSha },
          });
    }
    if (url.pathname.endsWith("/git/commits/" + baseSha)) {
      return Response.json({ sha: baseSha, tree: { sha: treeSha } });
    }
    if (url.pathname.endsWith("/git/trees")) {
      return Response.json({ sha: treeSha });
    }
    if (url.pathname.endsWith("/git/commits")) {
      return Response.json({ sha: updateSha });
    }
    if (url.pathname.includes("/git/refs/heads/")) {
      return Response.json({
        ref: "refs/heads/velvet/update/2.1.0",
        object: { type: "commit", sha: updateSha },
      });
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  });
  const repository = await client.forRepository(7, 99);

  const committed = await repository.commitUpdate(
    "2.1.0",
    baseSha,
    MANAGED_TEMPLATE_PATHS.map((path) => ({ path, content: `${path}\n` })),
  );

  assert.equal(committed, updateSha);
  assert.equal(refReads >= 3, true, "it waited for the branch to appear");
});
