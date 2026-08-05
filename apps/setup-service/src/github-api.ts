import { createPrivateKey, createSign } from "node:crypto";

export const GITHUB_API_VERSION = "2026-03-10";
export const GITHUB_API_ORIGIN = "https://api.github.com";

const MAX_RESPONSE_BYTES = 1_048_576;

export interface GitHubAppApiOptions {
  appId: string;
  privateKey: string;
  fetch?: (request: Request) => Promise<Response>;
  nowSeconds?: () => number;
}

export type GitHubInstallationPermissions = Readonly<
  Record<string, "read" | "write">
>;

/** How many of GitHub's own validation reasons are kept. */
const MAX_GITHUB_REASONS = 4;

export class GitHubApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;
  /**
   * Which fields GitHub refused and why, as `field:code` pairs.
   *
   * Empty unless GitHub returned a validation error. Only the field name and
   * the reason code are kept, never the message beside them: those two are
   * GitHub's own vocabulary, whilst a message can quote what was sent to it.
   * Without them a 422 is a number, and telling a name that is taken from one
   * that is invalid means guessing.
   */
  readonly reasons: readonly string[];

  constructor(response: Response, reasons: readonly string[] = []) {
    super("GitHub API request failed.");
    this.name = "GitHubApiError";
    this.status = response.status;
    this.requestId = response.headers.get("X-GitHub-Request-Id");
    this.retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
    this.reasons = reasons;
  }
}

/**
 * Reads GitHub's validation reasons out of a refused request.
 *
 * Only from a 422, which is the status that carries them, and only the field
 * and code of each. The body is consumed either way, so nothing is left open
 * when it holds something else.
 *
 * @param response - The failed response, whose body this consumes.
 * @returns The reasons as `field:code`, or empty where there are none.
 */
async function readGitHubReasons(response: Response): Promise<string[]> {
  if (response.status !== 422) {
    await response.body?.cancel();
    return [];
  }
  try {
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.errors)) return [];
    return body.errors
      .filter((entry): entry is Record<string, unknown> => isRecord(entry))
      .slice(0, MAX_GITHUB_REASONS)
      .map((entry) => {
        const field = typeof entry.field === "string" ? entry.field : "unknown";
        const code = typeof entry.code === "string" ? entry.code : "unknown";
        return `${field}:${code}`;
      });
  } catch {
    return [];
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

export function createGitHubRequest(
  fetchImplementation: (request: Request) => Promise<Response>,
  userAgent: string,
): <T>(path: string, token: string, init?: RequestInit) => Promise<T> {
  return async <T>(
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
          "User-Agent": userAgent,
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
          ...init.headers,
        },
      }),
    );
    if (!response.ok) {
      throw new GitHubApiError(response, await readGitHubReasons(response));
    }
    return readBoundedJson<T>(response);
  };
}

/**
 * Mints a token for every repository an installation covers.
 *
 * Used only where the work is to find out which repositories exist at all, so
 * there is nothing to scope it to yet. Anything that acts on one repository
 * uses {@link createRepositoryInstallationToken} instead, which is scoped to
 * that repository alone.
 *
 * @param permissions - Kept to what the enumeration itself needs.
 */
export async function createInstallationToken(
  options: GitHubAppApiOptions,
  installationId: number,
  permissions: GitHubInstallationPermissions,
  userAgent: string,
): Promise<string> {
  const fetchImplementation = options.fetch ?? ((request) => fetch(request));
  const githubRequest = createGitHubRequest(fetchImplementation, userAgent);
  const body = await githubRequest<unknown>(
    `/app/installations/${installationId}/access_tokens`,
    createGitHubAppJwt(options.appId, options.privateKey, options.nowSeconds),
    { method: "POST", body: JSON.stringify({ permissions }) },
  );
  if (!isRecord(body) || typeof body.token !== "string") {
    throw new Error("GitHub installation token response was invalid.");
  }
  return body.token;
}

export async function createRepositoryInstallationToken(
  options: GitHubAppApiOptions,
  installationId: number,
  repositoryId: number,
  permissions: GitHubInstallationPermissions,
  userAgent: string,
): Promise<string> {
  const fetchImplementation = options.fetch ?? ((request) => fetch(request));
  const githubRequest = createGitHubRequest(fetchImplementation, userAgent);
  const appJwt = createGitHubAppJwt(
    options.appId,
    options.privateKey,
    options.nowSeconds,
  );
  const body = await githubRequest<unknown>(
    `/app/installations/${installationId}/access_tokens`,
    appJwt,
    {
      method: "POST",
      body: JSON.stringify({
        repository_ids: [repositoryId],
        permissions,
      }),
    },
  );
  if (!isRecord(body) || typeof body.token !== "string") {
    throw new Error("GitHub installation token response was invalid.");
  }
  return body.token;
}

export async function readBoundedJson<T>(response: Response): Promise<T> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
