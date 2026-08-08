import type { RepositoryVisibility } from "@velvet/contracts";

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

/**
 * Attempts to dispatch a workflow GitHub has not finished registering.
 *
 * A workflow file becomes dispatchable some seconds after the push that wrote
 * it, and GitHub answers 404 until then. That 404 means "not yet" rather than
 * "not there", because the setup wrote the file itself moments earlier.
 *
 * The failure this covers came seven seconds after the repository was created,
 * so the window is longer than that. Ten attempts a second and a half apart
 * carry it to roughly fifteen seconds, whilst the ceiling still surfaces a
 * genuine permission failure rather than looping on it.
 */
const DISPATCH_ATTEMPTS = 10;
const DISPATCH_DELAY_MS = 1_500;
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

/**
 * Every repository feature stated at creation, on or off.
 *
 * Stated in full rather than left to GitHub's defaults, so a status page
 * repository offers what Velvet uses and nothing else. Issues carry incidents
 * and maintenance, and updates arrive as pull requests that are squashed, so
 * the other two merge methods would only ever produce a history Velvet does not
 * write. A merged update branch is removed with its pull request.
 */
const REPOSITORY_FEATURES = {
  has_issues: true,
  has_wiki: false,
  has_projects: false,
  has_downloads: false,
  allow_squash_merge: true,
  allow_merge_commit: false,
  allow_rebase_merge: false,
  delete_branch_on_merge: true,
} as const;

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

/** One file written during setup, addressed by its repository path. */
export interface GitHubManagedSetupFile {
  path: string;
  content: string;
  /**
   * How `content` is encoded, where it is not text.
   *
   * A tree entry's `content` is always text, so a file that is not becomes a
   * blob of its own first and the tree names its SHA. Absent means text, which
   * every Velvet-owned file is.
   */
  encoding?: "base64";
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
  /** The repository under this name, or null when the name is free. */
  findRepository(
    userToken: string,
    owner: string,
    name: string,
  ): Promise<GitHubRepository | null>;
  /**
   * The installation Velvet holds on a repository, or null when it holds none.
   *
   * A user token reaches every public repository, so setup can see one it has
   * no say over. Deleting it needs an installation, and this is what says
   * whether there is one.
   */
  repositoryInstallationId(owner: string, name: string): Promise<number | null>;
  deleteRepository(userToken: string, owner: string, name: string): Promise<void>;
  /**
   * Creates the repository an installation lives in, with a first commit.
   *
   * Empty of everything but that commit. What an installation receives is
   * written from the release artefact immediately afterwards, so it comes from
   * the reviewed bytes the service carries rather than from whatever another
   * repository holds at the moment somebody presses the button.
   *
   * `auto_init` is what gives it a default branch, which the write needs a
   * parent on. Its README is replaced by Velvet's in that same write.
   */
  createRepository(
    userToken: string,
    owner: string,
    name: string,
    visibility: RepositoryVisibility,
    ownerIsViewer: boolean,
  ): Promise<GitHubRepository>;
  /**
   * A token carrying everything setup writes with, for one repository.
   *
   * There is no lesser token to fall back to. Every permission it asks for is
   * needed by something setup does, and a repository missing any of them is a
   * repository that cannot monitor or publish.
   */
  createInstallationToken(
    installationId: number,
    repositoryId: number,
  ): Promise<string>;
  deleteInstallation(installationId: number): Promise<void>;
  /**
   * Whether the installation token can read the repository at all.
   *
   * GitHub takes a moment to grant a token access to a repository that has
   * just been created, and this is what says when it has. Asked of the
   * repository itself rather than of a file, because the first file Velvet
   * writes does not exist until after this answers.
   */
  repositoryReadable(
    installationToken: string,
    owner: string,
    repository: string,
  ): Promise<boolean>;
  /**
   * The configuration's blob SHA, or null where the file is not there yet.
   *
   * Null on a first setup, because Velvet creates the repository empty and
   * writes this file itself. A repeated run finds the previous one and needs
   * its SHA to replace it.
   */
  getConfigurationSha(
    installationToken: string,
    owner: string,
    repository: string,
  ): Promise<string | null>;
  writeConfiguration(
    installationToken: string,
    owner: string,
    repository: string,
    source: string,
    sha: string | null,
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

    async findRepository(userToken, owner, name) {
      // A 404 is the answer rather than a failure here, so it is read as one
      // instead of being thrown. Anything else is a real failure and is left to
      // the caller, because "GitHub did not answer" must never be mistaken for
      // "the name is free" by something about to create a repository.
      try {
        return parseRepository(
          await githubRequest<unknown>(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
            userToken,
          ),
        );
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) return null;
        throw error;
      }
    },

    async repositoryInstallationId(owner, name) {
      // Asked as the app itself, because a user token only reports what that
      // user can see. What matters here is which installation, if any, Velvet
      // holds on this repository, and a 404 is GitHub saying "none".
      const appJwt = createGitHubAppJwt(
        options.appId,
        options.privateKey,
        nowSeconds,
      );
      try {
        const body = await githubRequest<unknown>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/installation`,
          appJwt,
        );
        if (!isRecord(body) || typeof body.id !== "number") {
          throw new Error("GitHub installation response was invalid.");
        }
        return body.id;
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) return null;
        throw error;
      }
    },

    async deleteRepository(userToken, owner, name) {
      await githubRequest<unknown>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
        userToken,
        { method: "DELETE" },
      );
    },

    async createRepository(userToken, owner, name, visibility, ownerIsViewer) {
      // Creating under one's own account and creating under an organisation are
      // different routes on GitHub. Which it is comes from the caller, which
      // already knows who signed in, rather than from another request here.
      const path = ownerIsViewer
        ? "/user/repos"
        : `/orgs/${encodeURIComponent(owner)}/repos`;
      const body = await githubRequest<unknown>(path, userToken, {
        method: "POST",
        body: JSON.stringify({
          name,
          private: visibility === "private",
          auto_init: true,
          ...REPOSITORY_FEATURES,
        }),
      });
      return parseRepository(body);
    },

    async createInstallationToken(installationId, repositoryId) {
      return createRepositoryInstallationToken(
        { ...options, fetch: fetchImplementation, nowSeconds },
        installationId,
        repositoryId,
        SETUP_PERMISSIONS,
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

    async repositoryReadable(installationToken, owner, repository) {
      // A 404 is GitHub saying "not yet" whilst it grants the token its
      // access, so it is read as an answer. Anything else is a real failure.
      try {
        await githubRequest<unknown>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
          installationToken,
        );
        return true;
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) return false;
        throw error;
      }
    },

    async getConfigurationSha(installationToken, owner, repository) {
      let body: unknown;
      try {
        body = await githubRequest<unknown>(
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${CONFIGURATION_PATH}`,
          installationToken,
        );
      } catch (error) {
        if (error instanceof GitHubApiError && error.status === 404) return null;
        throw error;
      }
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
          // The SHA says which blob is being replaced, so it is sent only when
          // there is one. Sending it for a file that does not exist is refused.
          body: JSON.stringify({
            message: "Configure Velvet [skip ci]",
            content: Buffer.from(source).toString("base64"),
            ...(sha === null ? {} : { sha }),
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
      /*
       * A base64 file becomes a blob of its own first, and the tree names its
       * SHA. A tree entry's `content` is text, so an image sent that way would
       * be committed as the letters of its encoding rather than as the image.
       */
      const blobs = await Promise.all(
        files.map(async (file) => {
          if (file.encoding !== "base64") {
            return { path: file.path, content: file.content };
          }
          const blob = await githubRequest<unknown>(`${root}/git/blobs`, installationToken, {
            method: "POST",
            body: JSON.stringify({ content: file.content, encoding: "base64" }),
          });
          if (!isRecord(blob) || typeof blob.sha !== "string") {
            throw new Error("GitHub blob response was invalid.");
          }
          return { path: file.path, sha: blob.sha };
        }),
      );

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
            tree: blobs.map((file) => ({
              path: file.path,
              mode: "100644",
              type: "blob",
              ...("sha" in file ? { sha: file.sha } : { content: file.content }),
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
      for (let attempt = 1; attempt <= DISPATCH_ATTEMPTS; attempt += 1) {
        try {
          const body = await githubRequest<unknown>(
            `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${SETUP_WORKFLOW}/dispatches`,
            installationToken,
            { method: "POST", body: JSON.stringify({ ref: "main" }) },
          );
          if (!isRecord(body) || !positiveInteger(body.workflow_run_id)) {
            throw new Error("GitHub workflow dispatch response was invalid.");
          }
          return body.workflow_run_id;
        } catch (error) {
          const unregistered =
            error instanceof GitHubApiError &&
            error.status === 404 &&
            attempt < DISPATCH_ATTEMPTS;
          if (!unregistered) throw error;
          await Bun.sleep(DISPATCH_DELAY_MS);
        }
      }
      // The final attempt rethrows rather than sleeping, so the loop is left
      // only by a return or a throw above.
      throw new Error("GitHub workflow dispatch exhausted its attempts.");
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
