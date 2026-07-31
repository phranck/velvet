import { MANAGED_TEMPLATE_PATHS } from "@velvet/contracts";

import type {
  GitHubManagedFile,
  GitHubUpdateCheckRun,
  GitHubUpdatePullRequest,
  GitHubUpdateRepository,
} from "./update-github-types.js";

export const MAX_MANAGED_FILE_BYTES = 524_288;
const MAX_MANAGED_FILES_BYTES = 4_194_304;
export const COMMIT_SHA = /^[a-f0-9]{40}$/u;
const MANAGED_PATHS = new Set<string>(MANAGED_TEMPLATE_PATHS);

export function parseRepository(
  value: unknown,
  expectedId: number,
): GitHubUpdateRepository {
  if (
    !isRecord(value) ||
    value.id !== expectedId ||
    typeof value.name !== "string" ||
    !validRepositoryName(value.name) ||
    typeof value.default_branch !== "string" ||
    !validBranch(value.default_branch) ||
    !isRecord(value.owner) ||
    typeof value.owner.login !== "string" ||
    !validOwner(value.owner.login)
  ) {
    throw new Error("GitHub update repository response was invalid.");
  }
  return {
    id: expectedId,
    owner: value.owner.login,
    name: value.name,
    defaultBranch: value.default_branch,
  };
}

export function parseReference(value: unknown, expectedRef: string): string {
  if (
    !isRecord(value) ||
    value.ref !== expectedRef ||
    !isRecord(value.object) ||
    value.object.type !== "commit" ||
    typeof value.object.sha !== "string" ||
    !COMMIT_SHA.test(value.object.sha)
  ) {
    throw new Error("GitHub reference response was invalid.");
  }
  return value.object.sha;
}

export function parseCommitTree(value: unknown, expectedSha: string): string {
  if (
    !isRecord(value) ||
    value.sha !== expectedSha ||
    !isRecord(value.tree) ||
    typeof value.tree.sha !== "string" ||
    !COMMIT_SHA.test(value.tree.sha)
  ) {
    throw new Error("GitHub commit response was invalid.");
  }
  return value.tree.sha;
}

export function parseShaObject(value: unknown, message: string): string {
  if (
    !isRecord(value) ||
    typeof value.sha !== "string" ||
    !COMMIT_SHA.test(value.sha)
  ) {
    throw new Error(message);
  }
  return value.sha;
}

export function parsePullRequest(value: unknown): GitHubUpdatePullRequest {
  if (
    !isRecord(value) ||
    !positiveInteger(value.number) ||
    (value.state !== "open" && value.state !== "closed") ||
    typeof value.html_url !== "string" ||
    !safeGitHubUrl(value.html_url) ||
    !isRecord(value.head) ||
    typeof value.head.ref !== "string" ||
    typeof value.head.sha !== "string" ||
    !COMMIT_SHA.test(value.head.sha) ||
    !isRecord(value.base) ||
    typeof value.base.ref !== "string" ||
    typeof value.base.sha !== "string" ||
    !COMMIT_SHA.test(value.base.sha)
  ) {
    throw new Error("GitHub pull request response was invalid.");
  }
  return {
    number: value.number,
    state: value.state,
    htmlUrl: value.html_url,
    headRef: value.head.ref,
    headSha: value.head.sha,
    baseRef: value.base.ref,
    baseSha: value.base.sha,
  };
}

export function parseCheckRun(
  value: unknown,
  expectedHeadSha: string,
): GitHubUpdateCheckRun {
  if (
    !isRecord(value) ||
    !positiveInteger(value.id) ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    value.name.length > 256 ||
    !checkStatus(value.status) ||
    (value.conclusion !== null && typeof value.conclusion !== "string") ||
    typeof value.html_url !== "string" ||
    !safeGitHubUrl(value.html_url) ||
    value.head_sha !== expectedHeadSha
  ) {
    throw new Error("GitHub check-run response was invalid.");
  }
  return {
    id: value.id,
    name: value.name,
    status: value.status,
    conclusion: value.conclusion,
    htmlUrl: value.html_url,
    headSha: expectedHeadSha,
  };
}

export function validateManagedFiles(
  files: readonly GitHubManagedFile[],
): GitHubManagedFile[] {
  const byPath = new Map<string, GitHubManagedFile>();
  let totalBytes = 0;
  for (const file of files) {
    if (
      !MANAGED_PATHS.has(file.path) ||
      byPath.has(file.path) ||
      typeof file.content !== "string"
    ) {
      throw new TypeError("Updates must contain the complete Velvet-owned file set.");
    }
    const bytes = Buffer.byteLength(file.content, "utf8");
    if (bytes > MAX_MANAGED_FILE_BYTES) {
      throw new TypeError("A managed Velvet file exceeds the supported size.");
    }
    totalBytes += bytes;
    byPath.set(file.path, file);
  }
  if (
    byPath.size !== MANAGED_TEMPLATE_PATHS.length ||
    MANAGED_TEMPLATE_PATHS.some((path) => !byPath.has(path))
  ) {
    throw new TypeError("Updates must contain the complete Velvet-owned file set.");
  }
  if (totalBytes > MAX_MANAGED_FILES_BYTES) {
    throw new TypeError("The managed Velvet update exceeds the supported size.");
  }
  return MANAGED_TEMPLATE_PATHS.map((path) => byPath.get(path)!);
}

export function assertCommitSha(value: string): void {
  if (!COMMIT_SHA.test(value)) {
    throw new TypeError("GitHub commit SHA is invalid.");
  }
}

function checkStatus(
  value: unknown,
): value is GitHubUpdateCheckRun["status"] {
  return value === "requested" ||
    value === "waiting" ||
    value === "pending" ||
    value === "queued" ||
    value === "in_progress" ||
    value === "completed";
}

function safeGitHubUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com";
  } catch {
    return false;
  }
}

function validOwner(value: string): boolean {
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(value);
}

function validRepositoryName(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,100}$/u.test(value);
}

function validBranch(value: string): boolean {
  return value.length > 0 &&
    value.length <= 255 &&
    !/[\s~^:?*[\\]/u.test(value);
}

export function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
