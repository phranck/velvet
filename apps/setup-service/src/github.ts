import {
  GITHUB_API_VERSION,
  GITHUB_API_ORIGIN,
  GitHubApiError,
  type GitHubInstallationPermissions,
  createGitHubAppJwt,
  createGitHubRequest,
  createRepositoryInstallationToken,
  readBoundedJson,
} from "./github-api.js";

export {
  GITHUB_API_VERSION,
  GitHubApiError,
  createGitHubAppJwt,
} from "./github-api.js";
export const TEMPLATE_REPOSITORY = "phranck/velvet-template";
export const SETUP_WORKFLOW = "velvet.yml";

/**
 * Attempts to push the managed file set onto a head that may still be moving.
 *
 * GitHub serves the previous head for a moment after a commit, so a push built
 * on it is refused as a non-fast-forward. Six attempts half a second apart
 * cover that window comfortably whilst still failing a genuine conflict.
 */
const MANAGED_WRITE_ATTEMPTS = 6;
const MANAGED_WRITE_DELAY_MS = 500;
export const CONFIGURATION_PATH = "velvet.yml";
export const VERSION_LOCK_PATH = "velvet.lock.json";

/**
 * Access setup needs to produce a complete, working installation.
 *
 * `workflows` is required to write the monitor workflows, which must be
 * tailored to the configuration so that a check using a header secret receives
 * it. Without that permission the workflows keep the template's placeholder and
 * such a check silently runs without its header.
 */
const SETUP_PERMISSIONS: GitHubInstallationPermissions = {
  actions: "write",
  administration: "write",
  contents: "write",
  pages: "write",
  workflows: "write",
};

/** The set granted before workflow tailoring existed. */
const LEGACY_SETUP_PERMISSIONS: GitHubInstallationPermissions = {
  actions: "write",
  administration: "write",
  contents: "write",
  pages: "write",
};

export interface GitHubViewer {
  login: string;
  avatarUrl: string;
}

export interface GitHubAccount {
  id: number;
  login: string;
  type: "User" | "Organization";
}

export interface GitHubInstallation {
  id: number;
  accountLogin: string;
  accountType: "User" | "Organization";
  repositorySelection: "all" | "selected";
}

export interface GitHubRepository {
  id: number;
  name: string;
  owner: string;
  ownerId: number;
  htmlUrl: string;
  defaultBranch: string;
}

export interface GitHubWorkflowRun {
  id: number;
  status: "requested" | "waiting" | "pending" | "queued" | "in_progress" | "completed";
  conclusion: string | null;
  htmlUrl: string;
}

export interface GitHubWorkflowJob {
  name: string;
  status: GitHubWorkflowRun["status"];
  conclusion: string | null;
}

/**
 * A setup token plus what it is actually permitted to do.
 *
 * `canWriteWorkflows` is false when the app installation predates the workflow
 * permission, so callers can degrade deliberately instead of failing a write
 * they cannot perform.
 */
/** One file written during setup, addressed by its repository path. */
export interface GitHubManagedSetupFile {
  path: string;
  content: string;
}

export interface GitHubSetupToken {
  token: string;
  canWriteWorkflows: boolean;
}

export interface GitHubPagesSite {
  htmlUrl: string;
  status: string | null;
}

export interface GitHubSetupClient {
  exchangeOAuthCode(code: string, codeVerifier: string): Promise<string>;
  viewer(userToken: string): Promise<GitHubViewer>;
  account(userToken: string, login: string): Promise<GitHubAccount>;
  listInstallations(userToken: string): Promise<GitHubInstallation[]>;
  createRepositoryFromTemplate(
    userToken: string,
    owner: string,
    name: string,
  ): Promise<GitHubRepository>;
  createInstallationToken(
    installationId: number,
    repositoryId: number,
  ): Promise<GitHubSetupToken>;
  deleteInstallation(installationId: number): Promise<void>;
  getConfigurationSha(
    installationToken: string,
    owner: string,
    repository: string,
  ): Promise<string>;
  writeConfiguration(
    installationToken: string,
    owner: string,
    repository: string,
    source: string,
    sha: string,
  ): Promise<void>;
  writeManagedFiles(
    installationToken: string,
    owner: string,
    repository: string,
    files: readonly GitHubManagedSetupFile[],
  ): Promise<void>;
  enablePages(
    installationToken: string,
    owner: string,
    repository: string,
  ): Promise<GitHubPagesSite>;
  configurePagesCustomDomain(
    installationToken: string,
    owner: string,
    repository: string,
    customDomain: string,
  ): Promise<void>;
  dispatchWorkflow(
    installationToken: string,
    owner: string,
    repository: string,
  ): Promise<number>;
  workflowJobs(
    installationToken: string,
    owner: string,
    repository: string,
    runId: number,
  ): Promise<GitHubWorkflowJob[]>;
  workflowRun(
    installationToken: string,
    owner: string,
    repository: string,
    runId: number,
  ): Promise<GitHubWorkflowRun>;
  pages(
    installationToken: string,
    owner: string,
    repository: string,
  ): Promise<GitHubPagesSite>;
  revokeUserToken(userToken: string): Promise<void>;
}

interface GitHubSetupClientOptions {
  appId: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  fetch?: (request: Request) => Promise<Response>;
  nowSeconds?: () => number;
}

export function createGitHubSetupClient(
  options: GitHubSetupClientOptions,
): GitHubSetupClient {
  const fetchImplementation = options.fetch ?? ((request) => fetch(request));
  const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1_000));
  const githubRequest = createGitHubRequest(
    fetchImplementation,
    "velvet-setup-service",
  );

  return {
    async exchangeOAuthCode(code, codeVerifier) {
      const response = await fetchImplementation(
        new Request("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "velvet-setup-service",
          },
          body: JSON.stringify({
            client_id: options.clientId,
            client_secret: options.clientSecret,
            code,
            code_verifier: codeVerifier,
          }),
        }),
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new GitHubApiError(response);
      }
      const body = await readBoundedJson<unknown>(response);
      if (!isRecord(body) || typeof body.access_token !== "string") {
        throw new Error("GitHub OAuth response was invalid.");
      }
      return body.access_token;
    },

    async viewer(userToken) {
      const body = await githubRequest<unknown>("/user", userToken);
      if (
        !isRecord(body) ||
        typeof body.login !== "string" ||
        typeof body.avatar_url !== "string"
      ) {
        throw new Error("GitHub viewer response was invalid.");
      }
      return { login: body.login, avatarUrl: body.avatar_url };
    },

    async account(userToken, login) {
      const body = await githubRequest<unknown>(
        `/users/${encodeURIComponent(login)}`,
        userToken,
      );
      return parseAccount(body);
    },

    async listInstallations(userToken) {
      const body = await githubRequest<unknown>(
        "/user/installations?per_page=100",
        userToken,
      );
      if (!isRecord(body) || !Array.isArray(body.installations)) {
        throw new Error("GitHub installations response was invalid.");
      }
      return body.installations.map(parseInstallation);
    },

    async createRepositoryFromTemplate(userToken, owner, name) {
      const body = await githubRequest<unknown>(
        "/repos/phranck/velvet-template/generate",
        userToken,
        {
          method: "POST",
          body: JSON.stringify({
            owner,
            name,
            include_all_branches: false,
            private: false,
          }),
        },
      );
      return parseRepository(body);
    },

    async createInstallationToken(installationId, repositoryId) {
      const mint = (permissions: GitHubInstallationPermissions) =>
        createRepositoryInstallationToken(
          { ...options, fetch: fetchImplementation, nowSeconds },
          installationId,
          repositoryId,
          permissions,
          "velvet-setup-service",
        );
      try {
        return { token: await mint(SETUP_PERMISSIONS), canWriteWorkflows: true };
      } catch (error) {
        // GitHub refuses a token requesting more than the app was granted. The
        // workflow permission is newer than some installations, so falling back
        // keeps setup working on those whilst reporting that the generated
        // workflows cannot be tailored to the configuration.
        if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
        return {
          token: await mint(LEGACY_SETUP_PERMISSIONS),
          canWriteWorkflows: false,
        };
      }
    },

    async deleteInstallation(installationId) {
      const appJwt = createGitHubAppJwt(
        options.appId,
        options.privateKey,
        nowSeconds,
      );
      await githubRequest<void>(
        `/app/installations/${installationId}`,
        appJwt,
        { method: "DELETE" },
      );
    },

    async getConfigurationSha(installationToken, owner, repository) {
      const body = await githubRequest<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${CONFIGURATION_PATH}`,
        installationToken,
      );
      if (!isRecord(body) || typeof body.sha !== "string") {
        throw new Error("GitHub configuration response was invalid.");
      }
      return body.sha;
    },

    async writeConfiguration(
      installationToken,
      owner,
      repository,
      source,
      sha,
    ) {
      await githubRequest<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${CONFIGURATION_PATH}`,
        installationToken,
        {
          method: "PUT",
          body: JSON.stringify({
            message: "Configure Velvet [skip ci]",
            content: Buffer.from(source).toString("base64"),
            sha,
            branch: "main",
          }),
        },
      );
    },

    async writeManagedFiles(installationToken, owner, repository, files) {
      if (files.length === 0) return;
      const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;

      // Built and pushed as one commit, so an installation is never left with
      // some managed files updated and others still holding template defaults.
      //
      // The whole sequence repeats when the push is refused. GitHub serves the
      // previous head for a moment after a commit, and the configuration was
      // committed immediately before this, so the new commit can be built on a
      // parent that is already behind. The push is then not a fast-forward and
      // GitHub answers 422. Reading the head again is what resolves it, and a
      // real conflict still fails once the attempts run out.
      for (let attempt = 1; attempt <= MANAGED_WRITE_ATTEMPTS; attempt += 1) {
        const reference = await githubRequest<unknown>(
          `${root}/git/ref/heads/main`,
          installationToken,
        );
        if (
          !isRecord(reference) ||
          !isRecord(reference.object) ||
          typeof reference.object.sha !== "string"
        ) {
          throw new Error("GitHub reference response was invalid.");
        }
        const head = reference.object.sha;
        const parent = await githubRequest<unknown>(
          `${root}/git/commits/${head}`,
          installationToken,
        );
        if (
          !isRecord(parent) ||
          !isRecord(parent.tree) ||
          typeof parent.tree.sha !== "string"
        ) {
          throw new Error("GitHub commit response was invalid.");
        }
        const tree = await githubRequest<unknown>(`${root}/git/trees`, installationToken, {
          method: "POST",
          body: JSON.stringify({
            base_tree: parent.tree.sha,
            tree: files.map((file) => ({
              path: file.path,
              mode: "100644",
              type: "blob",
              content: file.content,
            })),
          }),
        });
        if (!isRecord(tree) || typeof tree.sha !== "string") {
          throw new Error("GitHub tree response was invalid.");
        }
        const commit = await githubRequest<unknown>(
          `${root}/git/commits`,
          installationToken,
          {
            method: "POST",
            body: JSON.stringify({
              message: "Configure Velvet [skip ci]",
              tree: tree.sha,
              parents: [head],
            }),
          },
        );
        if (!isRecord(commit) || typeof commit.sha !== "string") {
          throw new Error("GitHub commit response was invalid.");
        }

        try {
          await githubRequest<unknown>(
            `${root}/git/refs/heads/main`,
            installationToken,
            {
              method: "PATCH",
              body: JSON.stringify({ sha: commit.sha, force: false }),
            },
          );
          return;
        } catch (error) {
          const behind =
            error instanceof GitHubApiError &&
            error.status === 422 &&
            attempt < MANAGED_WRITE_ATTEMPTS;
          if (!behind) throw error;
          await Bun.sleep(MANAGED_WRITE_DELAY_MS);
        }
      }
    },

    async enablePages(installationToken, owner, repository) {
      const body = await githubRequest<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pages`,
        installationToken,
        { method: "POST", body: JSON.stringify({ build_type: "workflow" }) },
      );
      return parsePages(body);
    },

    async configurePagesCustomDomain(
      installationToken,
      owner,
      repository,
      customDomain,
    ) {
      await githubRequest<void>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pages`,
        installationToken,
        { method: "PUT", body: JSON.stringify({ cname: customDomain }) },
      );
    },

    async dispatchWorkflow(installationToken, owner, repository) {
      const body = await githubRequest<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${SETUP_WORKFLOW}/dispatches`,
        installationToken,
        { method: "POST", body: JSON.stringify({ ref: "main" }) },
      );
      if (!isRecord(body) || !positiveInteger(body.workflow_run_id)) {
        throw new Error("GitHub workflow dispatch response was invalid.");
      }
      return body.workflow_run_id;
    },

    async workflowJobs(installationToken, owner, repository, runId) {
      const body = await githubRequest<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/runs/${runId}/jobs?filter=latest&per_page=100`,
        installationToken,
      );
      if (!isRecord(body) || !Array.isArray(body.jobs)) {
        throw new Error("GitHub workflow jobs response was invalid.");
      }
      return body.jobs.map(parseWorkflowJob);
    },

    async workflowRun(installationToken, owner, repository, runId) {
      const body = await githubRequest<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/runs/${runId}`,
        installationToken,
      );
      if (
        !isRecord(body) ||
        !positiveInteger(body.id) ||
        !workflowStatus(body.status) ||
        (body.conclusion !== null && typeof body.conclusion !== "string") ||
        typeof body.html_url !== "string"
      ) {
        throw new Error("GitHub workflow response was invalid.");
      }
      return {
        id: body.id,
        status: body.status,
        conclusion: body.conclusion,
        htmlUrl: body.html_url,
      };
    },

    async pages(installationToken, owner, repository) {
      const body = await githubRequest<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/pages`,
        installationToken,
      );
      return parsePages(body);
    },

    async revokeUserToken(userToken) {
      const response = await fetchImplementation(
        new Request(
          `${GITHUB_API_ORIGIN}/applications/${encodeURIComponent(options.clientId)}/token`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Basic ${Buffer.from(`${options.clientId}:${options.clientSecret}`).toString("base64")}`,
              "Content-Type": "application/json",
              "User-Agent": "velvet-setup-service",
              "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
            body: JSON.stringify({ access_token: userToken }),
          },
        ),
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new GitHubApiError(response);
      }
      await response.body?.cancel();
    },
  };
}

function parseInstallation(value: unknown): GitHubInstallation {
  if (
    !isRecord(value) ||
    !positiveInteger(value.id) ||
    !isRecord(value.account) ||
    typeof value.account.login !== "string" ||
    (value.account.type !== "User" && value.account.type !== "Organization") ||
    (value.repository_selection !== "all" &&
      value.repository_selection !== "selected")
  ) {
    throw new Error("GitHub installation entry was invalid.");
  }
  return {
    id: value.id,
    accountLogin: value.account.login,
    accountType: value.account.type,
    repositorySelection: value.repository_selection,
  };
}

function parseAccount(value: unknown): GitHubAccount {
  if (
    !isRecord(value) ||
    !positiveInteger(value.id) ||
    typeof value.login !== "string" ||
    (value.type !== "User" && value.type !== "Organization")
  ) {
    throw new Error("GitHub account response was invalid.");
  }
  return { id: value.id, login: value.login, type: value.type };
}

function parseRepository(value: unknown): GitHubRepository {
  if (
    !isRecord(value) ||
    !positiveInteger(value.id) ||
    typeof value.name !== "string" ||
    typeof value.html_url !== "string" ||
    typeof value.default_branch !== "string" ||
    !isRecord(value.owner) ||
    typeof value.owner.login !== "string" ||
    !positiveInteger(value.owner.id)
  ) {
    throw new Error("GitHub repository response was invalid.");
  }
  return {
    id: value.id,
    name: value.name,
    owner: value.owner.login,
    ownerId: value.owner.id,
    htmlUrl: value.html_url,
    defaultBranch: value.default_branch,
  };
}

function parseWorkflowJob(value: unknown): GitHubWorkflowJob {
  if (
    !isRecord(value) ||
    !positiveInteger(value.id) ||
    typeof value.name !== "string" ||
    !workflowStatus(value.status) ||
    (value.conclusion !== null && typeof value.conclusion !== "string")
  ) {
    throw new Error("GitHub workflow job response was invalid.");
  }
  return {
    name: value.name,
    status: value.status,
    conclusion: value.conclusion,
  };
}

function parsePages(value: unknown): GitHubPagesSite {
  if (
    !isRecord(value) ||
    typeof value.html_url !== "string" ||
    (value.status !== undefined && value.status !== null && typeof value.status !== "string")
  ) {
    throw new Error("GitHub Pages response was invalid.");
  }
  return {
    htmlUrl: value.html_url,
    status: typeof value.status === "string" ? value.status : null,
  };
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function workflowStatus(
  value: unknown,
): value is GitHubWorkflowRun["status"] {
  return value === "requested" ||
    value === "waiting" ||
    value === "pending" ||
    value === "queued" ||
    value === "in_progress" ||
    value === "completed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
