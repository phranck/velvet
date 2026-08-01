import { MANAGED_TEMPLATE_PATHS } from "@velvet/contracts";

import type {
  GitHubManagedFile,
  GitHubUpdateCheckRun,
  GitHubUpdatePullRequest,
  GitHubUpdateRepository,
  GitHubUpdateWorkflowRun,
} from "./update-github-types.js";

export const MAX_MANAGED_FILE_BYTES = 524_288;
const MAX_MANAGED_FILES_BYTES = 4_194_304;
const MAX_CHANGED_PATH_LENGTH = 256;
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
  const mergedAt = isRecord(value) ? value.merged_at : undefined;
  const mergeCommitSha = isRecord(value) ? value.merge_commit_sha : undefined;
  // GitHub sets `merge_commit_sha` on an open pull request too, where it names
  // the test merge it computed rather than a merge that happened. Only
  // `merged_at` distinguishes the two, so requiring both to be absent together
  // rejects every open pull request GitHub actually returns.
  const mergedAtValid =
    mergedAt === null ||
    (typeof mergedAt === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(mergedAt));
  const mergeShaValid =
    mergeCommitSha === null ||
    (typeof mergeCommitSha === "string" && COMMIT_SHA.test(mergeCommitSha));
  // A merged pull request must name the commit it produced.
  const validMerge =
    mergedAtValid && mergeShaValid && (mergedAt === null || mergeCommitSha !== null);
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
    !COMMIT_SHA.test(value.base.sha) ||
    !validMerge ||
    (value.state === "open" && mergedAt !== null)
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
    mergedAt: mergedAt as string | null,
    mergeCommitSha: mergeCommitSha as string | null,
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

export function parseWorkflowRun(
  value: unknown,
  expectedHeadSha: string,
): GitHubUpdateWorkflowRun {
  if (
    !isRecord(value) ||
    !positiveInteger(value.id) ||
    value.event !== "workflow_dispatch" ||
    !checkStatus(value.status) ||
    (value.conclusion !== null && typeof value.conclusion !== "string") ||
    typeof value.html_url !== "string" ||
    !safeGitHubUrl(value.html_url) ||
    value.head_sha !== expectedHeadSha
  ) {
    throw new Error("GitHub workflow-run response was invalid.");
  }
  return {
    id: value.id,
    status: value.status,
    conclusion: value.conclusion,
    htmlUrl: value.html_url,
    headSha: expectedHeadSha,
  };
}

/**
 * Collects every repository path a changed-file response names.
 *
 * A rename reports its destination in `filename` and its origin in
 * `previous_filename`. Both sides are returned because renaming a protected
 * file onto a Velvet-owned path would otherwise pass an ownership check while
 * still deleting user content.
 *
 * @param value - Parsed body of the GitHub pull-request files endpoint.
 * @returns Every named path, destinations first, in response order.
 * @throws When the response is not a list of entries that all name a path.
 */
export function parseChangedPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("GitHub changed-files response was invalid.");
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      throw new Error("GitHub changed-files response was invalid.");
    }
    const current = entry.filename;
    const previous = entry.previous_filename;
    if (
      !changedPath(current) ||
      (previous !== undefined && !changedPath(previous))
    ) {
      throw new Error("GitHub changed-files response was invalid.");
    }
    return previous === undefined ? [current] : [current, previous];
  });
}

function changedPath(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_CHANGED_PATH_LENGTH;
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
