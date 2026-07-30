import {
  createPrivateKey,
  createSign,
} from "node:crypto";

export const GITHUB_API_VERSION = "2026-03-10";
export const TEMPLATE_REPOSITORY = "phranck/velvet-template";
export const SETUP_WORKFLOW = "velvet.yml";
export const CONFIGURATION_PATH = "velvet.yml";

const GITHUB_API_ORIGIN = "https://api.github.com";
const MAX_RESPONSE_BYTES = 1_048_576;

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
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  htmlUrl: string;
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
  repositoryInstallation(
    owner: string,
    repository: string,
  ): Promise<GitHubInstallation>;
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
  enablePages(
    installationToken: string,
    owner: string,
    repository: string,
  ): Promise<GitHubPagesSite>;
  dispatchWorkflow(
    installationToken: string,
    owner: string,
    repository: string,
  ): Promise<number>;
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

export class GitHubApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(response: Response) {
    super("GitHub API request failed.");
    this.name = "GitHubApiError";
    this.status = response.status;
    this.requestId = response.headers.get("X-GitHub-Request-Id");
    this.retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
  }
}

export function createGitHubAppJwt(
  appId: string,
  privateKey: string,
  nowSeconds: () => number = () => Math.floor(Date.now() / 1_000),
): string {
  const now = Math.floor(nowSeconds());
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({ iat: now - 60, exp: now + 540, iss: appId });
  const input = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  const signature = signer.sign(createPrivateKey(privateKey), "base64url");
  return `${input}.${signature}`;
}

export function createGitHubSetupClient(
  options: GitHubSetupClientOptions,
): GitHubSetupClient {
  const fetchImplementation = options.fetch ?? ((request) => fetch(request));
  const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1_000));

  const githubRequest = async <T>(
    path: string,
    token: string,
    init: RequestInit = {},
  ): Promise<T> => {
    const response = await fetchImplementation(
      new Request(`${GITHUB_API_ORIGIN}${path}`, {
        ...init,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "velvet-setup-service",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          ...init.headers,
        },
      }),
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new GitHubApiError(response);
    }
    return readJson<T>(response);
  };

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
      const body = await readJson<unknown>(response);
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
      const appJwt = createGitHubAppJwt(
        options.appId,
        options.privateKey,
        nowSeconds,
      );
      const body = await githubRequest<unknown>(
        `/app/installations/${installationId}/access_tokens`,
        appJwt,
        {
          method: "POST",
          body: JSON.stringify({
            repository_ids: [repositoryId],
            permissions: {
              actions: "write",
              administration: "write",
              contents: "write",
              pages: "write",
            },
          }),
        },
      );
      if (!isRecord(body) || typeof body.token !== "string") {
        throw new Error("GitHub installation token response was invalid.");
      }
      return body.token;
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

    async repositoryInstallation(owner, repository) {
      const appJwt = createGitHubAppJwt(
        options.appId,
        options.privateKey,
        nowSeconds,
      );
      const body = await githubRequest<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/installation`,
        appJwt,
      );
      return parseInstallation(body);
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
            message: "Configure Velvet",
            content: Buffer.from(source).toString("base64"),
            sha,
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

async function readJson<T>(response: Response): Promise<T> {
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("GitHub response exceeded the allowed size.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error("GitHub response exceeded the allowed size.");
  }
  if (bytes.byteLength === 0) return undefined as T;
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function parseRetryAfter(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function workflowStatus(
  value: unknown,
): value is GitHubWorkflowRun["status"] {
  return value === "queued" || value === "in_progress" || value === "completed";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
