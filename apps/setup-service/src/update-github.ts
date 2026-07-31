import {
  MANAGED_TEMPLATE_PATHS,
  SEMANTIC_VERSION_PATTERN,
  parseVelvetVersionLock,
} from "@velvet/contracts";

import {
  createGitHubRequest,
  createRepositoryInstallationToken,
  GitHubApiError,
  type GitHubAppApiOptions,
} from "./github-api.js";
import type {
  GitHubManagedFile,
  GitHubRepositoryUpdateClient,
  GitHubUpdateCheckRun,
  GitHubUpdateClient,
  GitHubUpdatePullRequest,
  GitHubUpdateRepository,
} from "./update-github-types.js";
import {
  COMMIT_SHA,
  MAX_MANAGED_FILE_BYTES,
  assertCommitSha,
  isRecord,
  nonNegativeInteger,
  parseCheckRun,
  parseCommitTree,
  parsePullRequest,
  parseReference,
  parseRepository,
  parseShaObject,
  parseWorkflowRun,
  positiveInteger,
  validateManagedFiles,
} from "./update-github-validation.js";

export type {
  GitHubManagedFile,
  GitHubRepositoryUpdateClient,
  GitHubUpdateCheckRun,
  GitHubUpdateClient,
  GitHubUpdateMerge,
  GitHubUpdatePullRequest,
  GitHubUpdateRepository,
  GitHubUpdateWorkflowRun,
} from "./update-github-types.js";

const UPDATE_USER_AGENT = "velvet-update-service";
const MAX_CHECK_RUN_PAGES = 10;
const PAGES_WORKFLOW_FILE = "velvet.yml";
const SEMANTIC_VERSION = new RegExp(SEMANTIC_VERSION_PATTERN, "u");

export function updateBranchName(version: string): string {
  if (!SEMANTIC_VERSION.test(version)) {
    throw new TypeError("Velvet update version is invalid.");
  }
  return `velvet/update/${version}`;
}

export function createGitHubUpdateClient(
  options: GitHubAppApiOptions,
): GitHubUpdateClient {
  const fetchImplementation = options.fetch ?? ((request) => fetch(request));
  const githubRequest = createGitHubRequest(
    fetchImplementation,
    UPDATE_USER_AGENT,
  );

  return {
    async forRepository(installationId, repositoryId) {
      if (!positiveInteger(installationId) || !positiveInteger(repositoryId)) {
        throw new TypeError("GitHub installation and repository IDs must be positive integers.");
      }
      const token = await createRepositoryInstallationToken(
        { ...options, fetch: fetchImplementation },
        installationId,
        repositoryId,
        {
          actions: "write",
          checks: "read",
          contents: "write",
          pull_requests: "write",
          workflows: "write",
        },
        UPDATE_USER_AGENT,
      );
      const repositoryBody = await githubRequest<unknown>(
        `/repositories/${repositoryId}`,
        token,
      );
      const repository = parseRepository(repositoryBody, repositoryId);
      return repositoryClient(githubRequest, token, repository);
    },
  };
}

function repositoryClient(
  githubRequest: <T>(
    path: string,
    token: string,
    init?: RequestInit,
  ) => Promise<T>,
  token: string,
  repository: GitHubUpdateRepository,
): GitHubRepositoryUpdateClient {
  const root = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;

  const reference = async (branch: string): Promise<string> => {
    const body = await githubRequest<unknown>(
      `${root}/git/ref/heads/${branch}`,
      token,
    );
    return parseReference(body, `refs/heads/${branch}`);
  };

  const content = async (
    path: string,
    ref: string,
  ): Promise<{ source: string; blobSha: string }> => {
    const body = await githubRequest<unknown>(
      `${root}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      token,
    );
    if (
      !isRecord(body) ||
      body.type !== "file" ||
      body.encoding !== "base64" ||
      typeof body.content !== "string" ||
      !nonNegativeInteger(body.size) ||
      body.size > MAX_MANAGED_FILE_BYTES ||
      typeof body.sha !== "string" ||
      !COMMIT_SHA.test(body.sha)
    ) {
      throw new Error("GitHub repository content response was invalid.");
    }
    const encoded = body.content.replace(/\s/gu, "");
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
        encoded,
      )
    ) {
      throw new Error("GitHub repository content response was invalid.");
    }
    const source = Buffer.from(encoded, "base64").toString("utf8");
    if (Buffer.byteLength(source, "utf8") !== body.size) {
      throw new Error("GitHub repository content response was invalid.");
    }
    return { source, blobSha: body.sha };
  };

  const pullRequest = async (
    pullRequestNumber: number,
    version: string,
    expectedHeadSha?: string,
  ): Promise<GitHubUpdatePullRequest> => {
    if (!positiveInteger(pullRequestNumber)) {
      throw new TypeError("GitHub pull request number must be a positive integer.");
    }
    const branch = updateBranchName(version);
    if (expectedHeadSha !== undefined) assertCommitSha(expectedHeadSha);
    const body = await githubRequest<unknown>(
      `${root}/pulls/${pullRequestNumber}`,
      token,
    );
    const parsed = parsePullRequest(body);
    if (
      parsed.headRef !== branch ||
      parsed.baseRef !== repository.defaultBranch ||
      (expectedHeadSha !== undefined && parsed.headSha !== expectedHeadSha)
    ) {
      throw new Error("GitHub returned an unexpected update pull request.");
    }
    return parsed;
  };

  const commitFiles = async (
    branch: string,
    expectedHeadSha: string,
    files: readonly GitHubManagedFile[],
    message: string,
  ): Promise<string> => {
    assertCommitSha(expectedHeadSha);
    const normalizedFiles = validateManagedFiles(files);
    const currentHead = await reference(branch);
    if (currentHead !== expectedHeadSha) {
      throw new Error("The repository branch changed before Velvet could commit the update.");
    }
    const parent = await githubRequest<unknown>(
      `${root}/git/commits/${expectedHeadSha}`,
      token,
    );
    const baseTree = parseCommitTree(parent, expectedHeadSha);
    const treeBody = await githubRequest<unknown>(`${root}/git/trees`, token, {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTree,
        tree: normalizedFiles.map((file) => ({
          path: file.path,
          mode: "100644",
          type: "blob",
          content: file.content,
        })),
      }),
    });
    const treeSha = parseShaObject(treeBody, "GitHub tree response was invalid.");
    const commitBody = await githubRequest<unknown>(
      `${root}/git/commits`,
      token,
      {
        method: "POST",
        body: JSON.stringify({
          message,
          tree: treeSha,
          parents: [expectedHeadSha],
        }),
      },
    );
    const commitSha = parseShaObject(
      commitBody,
      "GitHub commit response was invalid.",
    );
    const updated = await githubRequest<unknown>(
      `${root}/git/refs/heads/${branch}`,
      token,
      {
        method: "PATCH",
        body: JSON.stringify({ sha: commitSha, force: false }),
      },
    );
    const updatedSha = parseReference(updated, `refs/heads/${branch}`);
    if (updatedSha !== commitSha) {
      throw new Error("GitHub updated the repository to an unexpected commit.");
    }
    return commitSha;
  };

  return {
    repository,

    defaultBranchHead() {
      return reference(repository.defaultBranch);
    },

    readConfiguration() {
      return content("velvet.yml", repository.defaultBranch);
    },

    async readVersionLock() {
      const file = await content("velvet.lock.json", repository.defaultBranch);
      const parsed = parseVelvetVersionLock(file.source);
      if (!parsed.success) {
        throw new Error("The installed Velvet version lock is invalid.");
      }
      return { lock: parsed.data, blobSha: file.blobSha };
    },

    async readManagedFiles(ref) {
      assertCommitSha(ref);
      const files = await Promise.all(
        MANAGED_TEMPLATE_PATHS.map(async (path) => ({
          path,
          content: (await content(path, ref)).source,
        })),
      );
      return files;
    },

    async updateBranchHead(version) {
      try {
        return await reference(updateBranchName(version));
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) return null;
        throw error;
      }
    },

    async createUpdateBranch(version, baseSha) {
      const branch = updateBranchName(version);
      assertCommitSha(baseSha);
      const body = await githubRequest<unknown>(`${root}/git/refs`, token, {
        method: "POST",
        body: JSON.stringify({
          ref: `refs/heads/${branch}`,
          sha: baseSha,
        }),
      });
      const createdSha = parseReference(body, `refs/heads/${branch}`);
      if (createdSha !== baseSha) {
        throw new Error("GitHub created the update branch at an unexpected commit.");
      }
    },

    commitUpdate(version, expectedHeadSha, files) {
      return commitFiles(
        updateBranchName(version),
        expectedHeadSha,
        files,
        `Update Velvet to ${version}`,
      );
    },

    async createPullRequest(version, expectedHeadSha, expectedBaseSha) {
      const branch = updateBranchName(version);
      assertCommitSha(expectedHeadSha);
      assertCommitSha(expectedBaseSha);
      const body = await githubRequest<unknown>(`${root}/pulls`, token, {
        method: "POST",
        body: JSON.stringify({
          title: `Update Velvet to ${version}`,
          head: branch,
          base: repository.defaultBranch,
          body: `Automated managed update to Velvet ${version}.`,
          maintainer_can_modify: false,
        }),
      });
      const pullRequest = parsePullRequest(body);
      if (
        pullRequest.headRef !== branch ||
        pullRequest.headSha !== expectedHeadSha ||
        pullRequest.baseRef !== repository.defaultBranch ||
        pullRequest.baseSha !== expectedBaseSha
      ) {
        throw new Error("GitHub created an unexpected update pull request.");
      }
      return pullRequest;
    },

    async pullRequests(version) {
      const branch = updateBranchName(version);
      const query = new URLSearchParams({
        state: "all",
        head: `${repository.owner}:${branch}`,
        base: repository.defaultBranch,
        per_page: "100",
      });
      const body = await githubRequest<unknown>(
        `${root}/pulls?${query.toString()}`,
        token,
      );
      if (!Array.isArray(body)) {
        throw new Error("GitHub pull requests response was invalid.");
      }
      const pullRequests = body.map(parsePullRequest);
      if (
        pullRequests.some(
          (entry) =>
            entry.headRef !== branch ||
            entry.baseRef !== repository.defaultBranch,
        )
      ) {
        throw new Error("GitHub returned an unexpected update pull request.");
      }
      return pullRequests;
    },

    async checkRuns(headSha) {
      assertCommitSha(headSha);
      const checks: GitHubUpdateCheckRun[] = [];
      for (let page = 1; page <= MAX_CHECK_RUN_PAGES; page += 1) {
        const body = await githubRequest<unknown>(
          `${root}/commits/${headSha}/check-runs?filter=latest&per_page=100&page=${page}`,
          token,
        );
        if (
          !isRecord(body) ||
          !nonNegativeInteger(body.total_count) ||
          !Array.isArray(body.check_runs)
        ) {
          throw new Error("GitHub check-runs response was invalid.");
        }
        checks.push(
          ...body.check_runs.map((entry) => parseCheckRun(entry, headSha)),
        );
        if (checks.length >= body.total_count) return checks;
        if (body.check_runs.length !== 100) {
          throw new Error("GitHub check-runs response was incomplete.");
        }
      }
      throw new Error("GitHub returned too many check runs for one update.");
    },

    async pagesWorkflowRuns(headSha) {
      assertCommitSha(headSha);
      const query = new URLSearchParams({
        event: "workflow_dispatch",
        head_sha: headSha,
        per_page: "100",
      });
      const body = await githubRequest<unknown>(
        `${root}/actions/workflows/velvet.yml/runs?${query.toString()}`,
        token,
      );
      if (
        !isRecord(body) ||
        !nonNegativeInteger(body.total_count) ||
        !Array.isArray(body.workflow_runs) ||
        body.total_count !== body.workflow_runs.length
      ) {
        throw new Error("GitHub workflow-runs response was invalid.");
      }
      return body.workflow_runs.map((entry) => parseWorkflowRun(entry, headSha));
    },

    async dispatchPagesWorkflow(expectedHeadSha) {
      assertCommitSha(expectedHeadSha);
      const currentHead = await reference(repository.defaultBranch);
      if (currentHead !== expectedHeadSha) {
        throw new Error("The default branch changed before Velvet could publish the update.");
      }
      await githubRequest<void>(
        `${root}/actions/workflows/${encodeURIComponent(PAGES_WORKFLOW_FILE)}/dispatches`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ ref: repository.defaultBranch }),
        },
      );
    },

    async mergePullRequest(pullRequestNumber, version, expectedHeadSha) {
      await pullRequest(pullRequestNumber, version, expectedHeadSha);
      const body = await githubRequest<unknown>(
        `${root}/pulls/${pullRequestNumber}/merge`,
        token,
        {
          method: "PUT",
          body: JSON.stringify({
            sha: expectedHeadSha,
            merge_method: "squash",
            commit_title: `Update Velvet to ${version}`,
          }),
        },
      );
      if (
        !isRecord(body) ||
        typeof body.merged !== "boolean" ||
        (body.sha !== null &&
          (typeof body.sha !== "string" || !COMMIT_SHA.test(body.sha)))
      ) {
        throw new Error("GitHub merge response was invalid.");
      }
      if (body.merged && body.sha === null) {
        throw new Error("GitHub merge response was invalid.");
      }
      return { merged: body.merged, sha: body.sha };
    },

    async deleteUpdateBranch(version, expectedHeadSha) {
      const branch = updateBranchName(version);
      assertCommitSha(expectedHeadSha);
      const currentHead = await reference(branch);
      if (currentHead !== expectedHeadSha) {
        throw new Error("The update branch changed before Velvet could delete it.");
      }
      await githubRequest<void>(`${root}/git/refs/heads/${branch}`, token, {
        method: "DELETE",
      });
    },

    commitRevert(version, expectedHeadSha, files) {
      updateBranchName(version);
      return commitFiles(
        repository.defaultBranch,
        expectedHeadSha,
        files,
        `Revert Velvet ${version} update`,
      );
    },
  };
}
