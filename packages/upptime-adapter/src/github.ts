import { extractUpptimeSiteSlugs } from "./conversion.js";
import { UpptimeAdapterError } from "./errors.js";
import type { FetchImplementation } from "./fetch.js";
import type {
  UpptimeMigrationSource,
} from "./migration-types.js";
import type {
  UpptimeCommit,
  UpptimeIssue,
  UpptimeSnapshot,
} from "./types.js";

export interface GitHubUpptimeSourceOptions {
  owner: string;
  repo: string;
  ref?: string;
  token?: string;
  apiBaseUrl?: string;
  fetch?: FetchImplementation;
}

export interface GitHubUpptimeMigrationSourceOptions {
  repository: string;
  ref?: string;
  token?: string;
  apiBaseUrl?: string;
  fetch?: FetchImplementation;
}

export interface LoadedUpptimeMigrationSnapshot {
  source: UpptimeMigrationSource;
  snapshot: UpptimeSnapshot;
}

interface UpptimeSnapshotLoadBehavior {
  allowPartialHistory?: boolean;
}

interface GitHubContent {
  content: string;
  encoding: string;
}

interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    committer?: { date?: string | null } | null;
    author?: { date?: string | null } | null;
  };
}

interface GitHubRepository {
  default_branch: string;
}

interface GitHubRevision {
  sha: string;
  commit: {
    committer?: { date?: string | null } | null;
    author?: { date?: string | null } | null;
  };
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  created_at: string;
  closed_at: string | null;
  labels: Array<string | { name?: string }>;
  pull_request?: unknown;
}

function normalizeGitHubTimestamp(value: string, context: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new UpptimeAdapterError(
      "PARTIAL_UPSTREAM_DATA",
      `GitHub returned an invalid timestamp for ${context}`,
    );
  }
  return new Date(timestamp).toISOString();
}

class GitHubSource {
  private readonly apiBaseUrl: string;
  private readonly fetchImplementation: FetchImplementation;
  private readonly headers: HeadersInit;

  constructor(private readonly options: GitHubUpptimeSourceOptions) {
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(
      /\/$/,
      "",
    );
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "velvet-upptime-adapter",
      ...(options.token === undefined
        ? {}
        : { Authorization: `Bearer ${options.token}` }),
    };
  }

  private repositoryUrl(path?: string): URL {
    const owner = encodeURIComponent(this.options.owner);
    const repo = encodeURIComponent(this.options.repo);
    return new URL(
      `${this.apiBaseUrl}/repos/${owner}/${repo}${path === undefined ? "" : `/${path}`}`,
    );
  }

  private contentsUrl(path: string): URL {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = this.repositoryUrl(`contents/${encodedPath}`);
    if (this.options.ref !== undefined) {
      url.searchParams.set("ref", this.options.ref);
    }
    return url;
  }

  private async request(url: URL): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImplementation(url, { headers: this.headers });
    } catch (error) {
      throw new UpptimeAdapterError(
        "GITHUB_REQUEST_FAILED",
        `GitHub request failed: ${url.pathname}`,
        { cause: error },
      );
    }
    if (!response.ok) {
      if (
        response.status === 429 ||
        (response.status === 403 &&
          response.headers.get("x-ratelimit-remaining") === "0")
      ) {
        const resetAt = response.headers.get("x-ratelimit-reset");
        throw new UpptimeAdapterError(
          "GITHUB_RATE_LIMITED",
          `GitHub rate limit reached${resetAt === null ? "" : ` until ${resetAt}`}`,
        );
      }
      if (response.status === 404) {
        throw new UpptimeAdapterError(
          "GITHUB_REQUEST_FAILED",
          `GitHub resource not found: ${url.pathname}`,
          { status: response.status },
        );
      }
      throw new UpptimeAdapterError(
        "GITHUB_REQUEST_FAILED",
        `GitHub request failed with status ${response.status}: ${url.pathname}`,
        { status: response.status },
      );
    }
    return response;
  }

  private async responseJson(
    response: Response,
    context: string,
  ): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new UpptimeAdapterError(
        "PARTIAL_UPSTREAM_DATA",
        `GitHub returned malformed JSON for ${context}`,
        { cause: error },
      );
    }
  }

  async content(path: string): Promise<string> {
    const url = this.contentsUrl(path);
    let response: Response;
    try {
      response = await this.request(url);
    } catch (error) {
      if (
        error instanceof UpptimeAdapterError &&
        error.code === "GITHUB_REQUEST_FAILED" &&
        error.status === 404
      ) {
        throw new UpptimeAdapterError(
          path.startsWith("history/") && path !== "history/summary.json"
            ? "MISSING_HISTORY"
            : "PARTIAL_UPSTREAM_DATA",
          `Missing Upptime source file ${path}`,
          { cause: error, status: error.status },
        );
      }
      throw error;
    }
    const value = await this.responseJson(response, path);
    if (
      typeof value !== "object" ||
      value === null ||
      !("content" in value) ||
      !("encoding" in value) ||
      typeof (value as GitHubContent).content !== "string" ||
      (value as GitHubContent).encoding !== "base64"
    ) {
      throw new UpptimeAdapterError(
        "PARTIAL_UPSTREAM_DATA",
        `GitHub returned invalid content for ${path}`,
      );
    }
    return Buffer.from((value as GitHubContent).content, "base64").toString("utf8");
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.request(this.contentsUrl(path));
      return true;
    } catch (error) {
      if (
        error instanceof UpptimeAdapterError &&
        error.code === "GITHUB_REQUEST_FAILED" &&
        error.status === 404
      ) {
        return false;
      }
      throw error;
    }
  }

  async resolveRevision(ref?: string): Promise<{
    ref: string;
    commit: string;
    committedAt: string;
  }> {
    let resolvedRef = ref;
    if (resolvedRef === undefined) {
      const response = await this.request(this.repositoryUrl());
      const repository = await this.responseJson(response, "repository");
      if (
        !isGitHubRepository(repository) ||
        repository.default_branch.length === 0
      ) {
        throw new UpptimeAdapterError(
          "PARTIAL_UPSTREAM_DATA",
          "GitHub returned invalid repository metadata",
        );
      }
      resolvedRef = repository.default_branch;
    }
    const encodedRef = encodeURIComponent(resolvedRef);
    const response = await this.request(
      this.repositoryUrl(`commits/${encodedRef}`),
    );
    const revision = await this.responseJson(response, `revision ${resolvedRef}`);
    if (!isGitHubRevision(revision)) {
      throw new UpptimeAdapterError(
        "PARTIAL_UPSTREAM_DATA",
        `GitHub returned invalid revision metadata for ${resolvedRef}`,
      );
    }
    const committedAt =
      revision.commit.committer?.date ?? revision.commit.author?.date;
    if (typeof committedAt !== "string") {
      throw new UpptimeAdapterError(
        "PARTIAL_UPSTREAM_DATA",
        `GitHub returned no timestamp for revision ${resolvedRef}`,
      );
    }
    return {
      ref: resolvedRef,
      commit: revision.sha,
      committedAt: normalizeGitHubTimestamp(
        committedAt,
        `revision ${revision.sha}`,
      ),
    };
  }

  private async paginated<T>(initialUrl: URL): Promise<T[]> {
    const values: T[] = [];
    let nextUrl: URL | null = initialUrl;
    while (nextUrl !== null) {
      const response = await this.request(nextUrl);
      const page = await this.responseJson(response, nextUrl.pathname);
      if (!Array.isArray(page)) {
        throw new UpptimeAdapterError(
          "PARTIAL_UPSTREAM_DATA",
          `GitHub returned an invalid paginated response for ${nextUrl.pathname}`,
        );
      }
      values.push(...(page as T[]));
      const nextLink = response.headers
        .get("link")
        ?.split(",")
        .map((link) => link.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/))
        .find((match) => match?.[2] === "next")?.[1];
      nextUrl = nextLink === undefined ? null : new URL(nextLink);
    }
    return values;
  }

  async commits(path: string): Promise<UpptimeCommit[]> {
    const url = this.repositoryUrl("commits");
    url.searchParams.set("path", path);
    url.searchParams.set("per_page", "100");
    if (this.options.ref !== undefined) {
      url.searchParams.set("sha", this.options.ref);
    }
    const commits = await this.paginated<GitHubCommit>(url);
    return commits.map((commit) => {
      const committedAt = commit.commit.committer?.date ?? commit.commit.author?.date;
      if (
        typeof commit.sha !== "string" ||
        typeof commit.commit?.message !== "string" ||
        typeof committedAt !== "string"
      ) {
        throw new UpptimeAdapterError(
          "PARTIAL_UPSTREAM_DATA",
          `GitHub returned an invalid commit for ${path}`,
        );
      }
      return {
        sha: commit.sha,
        committedAt: normalizeGitHubTimestamp(committedAt, `commit ${commit.sha}`),
        message: commit.commit.message,
      };
    });
  }

  async issues(): Promise<UpptimeIssue[]> {
    const url = this.repositoryUrl("issues");
    url.searchParams.set("state", "all");
    url.searchParams.set("per_page", "100");
    const issues = await this.paginated<GitHubIssue>(url);
    return issues
      .filter((issue) => issue.pull_request === undefined)
      .map((issue) => {
        if (
          typeof issue.number !== "number" ||
          typeof issue.title !== "string" ||
          (issue.state !== "open" && issue.state !== "closed") ||
          typeof issue.created_at !== "string" ||
          !Array.isArray(issue.labels)
        ) {
          throw new UpptimeAdapterError(
            "PARTIAL_UPSTREAM_DATA",
            "GitHub returned an invalid issue",
          );
        }
        return {
          number: issue.number,
          title: issue.title,
          body: issue.body ?? "",
          state: issue.state,
          createdAt: normalizeGitHubTimestamp(
            issue.created_at,
            `issue ${issue.number}`,
          ),
          closedAt:
            issue.closed_at === null
              ? null
              : normalizeGitHubTimestamp(
                  issue.closed_at,
                  `issue ${issue.number}`,
                ),
          labels: issue.labels
            .map((label) => (typeof label === "string" ? label : label.name))
            .filter((label): label is string => typeof label === "string"),
        };
      });
  }
}

function isGitHubRepository(value: unknown): value is GitHubRepository {
  return (
    typeof value === "object" &&
    value !== null &&
    "default_branch" in value &&
    typeof value.default_branch === "string"
  );
}

function isGitHubRevision(value: unknown): value is GitHubRevision {
  return (
    typeof value === "object" &&
    value !== null &&
    "sha" in value &&
    typeof value.sha === "string" &&
    /^[0-9a-f]{40}$/u.test(value.sha) &&
    "commit" in value &&
    typeof value.commit === "object" &&
    value.commit !== null
  );
}

export async function loadUpptimeSnapshot(
  options: GitHubUpptimeSourceOptions,
  behavior: UpptimeSnapshotLoadBehavior = {},
): Promise<UpptimeSnapshot> {
  const source = new GitHubSource(options);
  const configYaml = await source.content(".upptimerc.yml");
  let summaryJson: string;
  try {
    summaryJson = await source.content("history/summary.json");
  } catch (error) {
    if (
      !(error instanceof UpptimeAdapterError) ||
      error.code !== "PARTIAL_UPSTREAM_DATA" ||
      error.status !== 404
    ) {
      throw error;
    }
    if (!(await source.exists("history"))) {
      return {
        configYaml,
        summaryJson: "[]",
        histories: {},
        commits: {},
        issues: await source.issues(),
        historyState: "absent",
      };
    }
    if (behavior.allowPartialHistory !== true) throw error;
    summaryJson = "[]";
  }
  const slugs = extractUpptimeSiteSlugs(configYaml);
  const histories: Record<string, string> = {};
  const commits: Record<string, UpptimeCommit[]> = {};

  for (const slug of slugs) {
    const path = `history/${slug}.yml`;
    try {
      histories[slug] = await source.content(path);
    } catch (error) {
      if (
        behavior.allowPartialHistory === true &&
        error instanceof UpptimeAdapterError &&
        error.code === "MISSING_HISTORY" &&
        error.status === 404
      ) {
        continue;
      }
      throw error;
    }
    commits[slug] = await source.commits(path);
  }

  return {
    configYaml,
    summaryJson,
    histories,
    commits,
    issues: await source.issues(),
  };
}

export async function loadUpptimeMigrationSnapshot(
  options: GitHubUpptimeMigrationSourceOptions,
): Promise<LoadedUpptimeMigrationSnapshot> {
  const repositoryParts = options.repository.split("/");
  const owner = repositoryParts[0];
  const repo = repositoryParts[1];
  if (
    repositoryParts.length !== 2 ||
    owner === undefined ||
    owner.length === 0 ||
    repo === undefined ||
    repo.length === 0
  ) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      `Invalid GitHub repository ${options.repository}`,
    );
  }
  const sharedOptions = {
    owner,
    repo,
    ...(options.token === undefined ? {} : { token: options.token }),
    ...(options.apiBaseUrl === undefined
      ? {}
      : { apiBaseUrl: options.apiBaseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  };
  const revision = await new GitHubSource(sharedOptions).resolveRevision(
    options.ref,
  );
  const snapshot = await loadUpptimeSnapshot({
    ...sharedOptions,
    ref: revision.commit,
  }, { allowPartialHistory: true });
  return {
    source: {
      repository: options.repository,
      ...revision,
    },
    snapshot,
  };
}
