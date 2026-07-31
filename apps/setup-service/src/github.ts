import {
  GITHUB_API_VERSION,
  GITHUB_API_ORIGIN,
  GitHubApiError,
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
export const CONFIGURATION_PATH = "velvet.yml";
export const VERSION_LOCK_PATH = "velvet.lock.json";

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
  createInstallationToken(installationId: number, repositoryId: number): Promise<string>;
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
  writeVersionLock(
    installationToken: string,
    owner: string,
    repository: string,
    source: string,
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
      return createRepositoryInstallationToken(
        { ...options, fetch: fetchImplementation, nowSeconds },
        installationId,
        repositoryId,
        {
          actions: "write",
          administration: "write",
          contents: "write",
          pages: "write",
        },
        "velvet-setup-service",
      );
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

    async writeVersionLock(installationToken, owner, repository, source) {
      // The lock does not exist in the template, so this creates it and
      // deliberately sends no blob SHA. GitHub rejects the write if the path
      // already exists, which stops a retry from overwriting a newer lock.
      await githubRequest<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${VERSION_LOCK_PATH}`,
        installationToken,
        {
          method: "PUT",
          body: JSON.stringify({
            message: "Record the installed Velvet version [skip ci]",
            content: Buffer.from(source).toString("base64"),
            branch: "main",
          }),
        },
      );
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
