import { GitHubIncidentsError } from "./errors.js";
import type {
  GitHubComment,
  GitHubIssue,
  GitHubIssueCreateInput,
  GitHubIssuesClient,
  GitHubIssuesClientOptions,
  GitHubIssueUpdateInput,
  GitHubLabelInput,
} from "./types.js";

const GITHUB_API_VERSION = "2026-03-10";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function parseLabels(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const labels = value.map((label) =>
    typeof label === "string"
      ? label
      : isRecord(label) && typeof label.name === "string"
        ? label.name
        : null,
  );
  return labels.every((label): label is string => label !== null)
    ? labels
    : null;
}

function parseIssue(value: unknown): GitHubIssue | null {
  if (!isRecord(value)) return null;
  const createdAt = normalizeTimestamp(value.created_at);
  const updatedAt = normalizeTimestamp(value.updated_at);
  const closedAt =
    value.closed_at === null ? null : normalizeTimestamp(value.closed_at);
  const labels = parseLabels(value.labels);
  if (
    typeof value.number !== "number" ||
    !Number.isInteger(value.number) ||
    typeof value.title !== "string" ||
    (value.body !== null && typeof value.body !== "string") ||
    (value.state !== "open" && value.state !== "closed") ||
    createdAt === null ||
    updatedAt === null ||
    (value.closed_at !== null && closedAt === null) ||
    labels === null
  ) {
    return null;
  }
  return {
    number: value.number,
    title: value.title,
    body: value.body ?? "",
    state: value.state,
    createdAt,
    updatedAt,
    closedAt,
    labels,
  };
}

function parseComment(value: unknown): GitHubComment | null {
  if (!isRecord(value)) return null;
  const createdAt = normalizeTimestamp(value.created_at);
  const updatedAt = normalizeTimestamp(value.updated_at);
  if (
    typeof value.id !== "number" ||
    !Number.isInteger(value.id) ||
    typeof value.body !== "string" ||
    createdAt === null ||
    updatedAt === null
  ) {
    return null;
  }
  return { id: value.id, body: value.body, createdAt, updatedAt };
}

function nextLink(response: Response): string | null {
  const link = response.headers.get("link");
  if (link === null) return null;
  return (
    link
      .split(",")
      .map((entry) => entry.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/u))
      .find((entry) => entry?.[2] === "next")?.[1] ?? null
  );
}

class RestGitHubIssuesClient implements GitHubIssuesClient {
  private readonly apiBaseUrl: URL;
  private readonly repositoryPath: string;
  private readonly fetchImplementation: NonNullable<
    GitHubIssuesClientOptions["fetch"]
  >;
  private readonly createErrorId: NonNullable<
    GitHubIssuesClientOptions["createErrorId"]
  >;

  constructor(private readonly options: GitHubIssuesClientOptions) {
    this.apiBaseUrl = new URL(options.apiBaseUrl ?? "https://api.github.com");
    this.repositoryPath = `/repos/${encodeURIComponent(options.owner)}/${encodeURIComponent(options.repo)}`;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.createErrorId = options.createErrorId ?? (() => crypto.randomUUID());
  }

  private url(path: string): URL {
    return new URL(`${this.repositoryPath}${path}`, this.apiBaseUrl);
  }

  private error(
    code: ConstructorParameters<typeof GitHubIncidentsError>[0],
    status?: number,
    cause?: unknown,
  ): GitHubIncidentsError {
    return new GitHubIncidentsError(code, {
      errorId: this.createErrorId(),
      ...(status === undefined ? {} : { status }),
      ...(cause === undefined ? {} : { cause }),
    });
  }

  private async request(
    url: URL,
    init: RequestInit = {},
    allowedStatuses: number[] = [],
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        ...init,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${this.options.token}`,
          "x-github-api-version": GITHUB_API_VERSION,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...init.headers,
        },
      });
    } catch (cause) {
      throw this.error("GITHUB_REQUEST_FAILED", undefined, cause);
    }

    if (response.ok || allowedStatuses.includes(response.status)) {
      return response;
    }
    if (response.status === 410) {
      throw this.error("GITHUB_ISSUES_DISABLED", response.status);
    }
    if (
      response.status === 429 ||
      (response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0")
    ) {
      throw this.error("GITHUB_RATE_LIMITED", response.status);
    }
    throw this.error("GITHUB_REQUEST_FAILED", response.status);
  }

  private async json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (cause) {
      throw this.error("INVALID_GITHUB_RESPONSE", response.status, cause);
    }
  }

  private nextUrl(response: Response): URL | null {
    const link = nextLink(response);
    if (link === null) return null;
    let parsed: URL;
    try {
      parsed = new URL(link);
    } catch (cause) {
      throw this.error("INVALID_GITHUB_RESPONSE", response.status, cause);
    }
    if (
      parsed.origin !== this.apiBaseUrl.origin ||
      !parsed.pathname.startsWith(`${this.repositoryPath}/`)
    ) {
      throw this.error("INVALID_GITHUB_RESPONSE", response.status);
    }
    return parsed;
  }

  async listIssues(label: string): Promise<GitHubIssue[]> {
    const initialUrl = this.url("/issues");
    initialUrl.searchParams.set("state", "all");
    initialUrl.searchParams.set("labels", label);
    initialUrl.searchParams.set("per_page", "100");
    const issues: GitHubIssue[] = [];
    let url: URL | null = initialUrl;
    while (url !== null) {
      const response = await this.request(url);
      const page = await this.json(response);
      if (!Array.isArray(page)) {
        throw this.error("INVALID_GITHUB_RESPONSE", response.status);
      }
      for (const value of page) {
        if (isRecord(value) && value.pull_request !== undefined) continue;
        const issue = parseIssue(value);
        if (issue === null) {
          throw this.error("INVALID_GITHUB_RESPONSE", response.status);
        }
        issues.push(issue);
      }
      url = this.nextUrl(response);
    }
    return issues;
  }

  async listComments(issueNumber: number): Promise<GitHubComment[]> {
    const initialUrl = this.url(`/issues/${issueNumber}/comments`);
    initialUrl.searchParams.set("per_page", "100");
    const comments: GitHubComment[] = [];
    let url: URL | null = initialUrl;
    while (url !== null) {
      const response = await this.request(url);
      const page = await this.json(response);
      if (!Array.isArray(page)) {
        throw this.error("INVALID_GITHUB_RESPONSE", response.status);
      }
      for (const value of page) {
        const comment = parseComment(value);
        if (comment === null) {
          throw this.error("INVALID_GITHUB_RESPONSE", response.status);
        }
        comments.push(comment);
      }
      url = this.nextUrl(response);
    }
    return comments;
  }

  async ensureLabel(input: GitHubLabelInput): Promise<void> {
    const labelUrl = this.url(`/labels/${encodeURIComponent(input.name)}`);
    const existing = await this.request(labelUrl, {}, [404]);
    if (existing.status !== 404) {
      const label = await this.json(existing);
      if (!isRecord(label) || typeof label.name !== "string") {
        throw this.error("INVALID_GITHUB_RESPONSE", existing.status);
      }
      return;
    }

    const created = await this.request(this.url("/labels"), {
      method: "POST",
      body: JSON.stringify(input),
    });
    const label = await this.json(created);
    if (!isRecord(label) || typeof label.name !== "string") {
      throw this.error("INVALID_GITHUB_RESPONSE", created.status);
    }
  }

  async createIssue(input: GitHubIssueCreateInput): Promise<GitHubIssue> {
    const response = await this.request(this.url("/issues"), {
      method: "POST",
      body: JSON.stringify(input),
    });
    const issue = parseIssue(await this.json(response));
    if (issue === null) {
      throw this.error("INVALID_GITHUB_RESPONSE", response.status);
    }
    return issue;
  }

  async updateIssue(
    issueNumber: number,
    input: GitHubIssueUpdateInput,
  ): Promise<GitHubIssue> {
    const body = {
      ...input,
      ...(input.state === "closed" ? { state_reason: "completed" } : {}),
      ...(input.state === "open" ? { state_reason: "reopened" } : {}),
    };
    const response = await this.request(this.url(`/issues/${issueNumber}`), {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    const issue = parseIssue(await this.json(response));
    if (issue === null) {
      throw this.error("INVALID_GITHUB_RESPONSE", response.status);
    }
    return issue;
  }

  async createComment(
    issueNumber: number,
    body: string,
  ): Promise<GitHubComment> {
    const response = await this.request(
      this.url(`/issues/${issueNumber}/comments`),
      { method: "POST", body: JSON.stringify({ body }) },
    );
    const comment = parseComment(await this.json(response));
    if (comment === null) {
      throw this.error("INVALID_GITHUB_RESPONSE", response.status);
    }
    return comment;
  }
}

export function createGitHubIssuesClient(
  options: GitHubIssuesClientOptions,
): GitHubIssuesClient {
  return new RestGitHubIssuesClient(options);
}
