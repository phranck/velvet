import { randomUUID } from "node:crypto";

import {
  SEMANTIC_VERSION_PATTERN,
  compareVelvetSemanticVersions,
  parseVelvetConfiguration,
  validateVelvetReleaseManifest,
} from "@velvet/contracts";
import { materializeManagedTemplateFiles } from "@velvet/template-files";

import { GitHubApiError } from "./github-api.js";
import type {
  GitHubManagedFile,
  GitHubRepositoryUpdateClient,
  GitHubUpdateCheckRun,
  GitHubUpdatePullRequest,
  GitHubUpdateWorkflowRun,
} from "./update-github-types.js";
import type {
  ManagedUpdateLogEntry,
  ManagedUpdateOrchestrator,
  ManagedUpdateOrchestratorOptions,
  ManagedUpdateReason,
  ManagedUpdateRequest,
  ManagedUpdateResult,
  ManagedUpdateState,
} from "./update-orchestrator-types.js";
import {
  ManagedUpdateError,
  managedUpdateErrorCode,
} from "./update-error.js";
import { positiveInteger } from "./update-github-validation.js";
import {
  isProtectedBranch,
  protectedChangedPaths,
} from "./update-ownership.js";

export type {
  ManagedUpdateOrchestrator,
  ManagedUpdateOrchestratorOptions,
  ManagedUpdateReason,
  ManagedUpdateRelease,
  ManagedUpdateReleaseProvider,
  ManagedUpdateRequest,
  ManagedUpdateResult,
  ManagedUpdateState,
  ManagedUpdateTrigger,
} from "./update-orchestrator-types.js";

const SEMANTIC_VERSION = new RegExp(SEMANTIC_VERSION_PATTERN, "u");
const MAX_READ_ATTEMPTS = 5;

/**
 * Wraps whatever a reconcile attempt threw into the public boundary shape.
 *
 * Internal failures stay internal. Only a stable code, the fixed safe message
 * for it, and a unique error ID leave this function, and the original cause is
 * handed to the log sink instead of to the caller.
 */
function boundaryError(
  request: ManagedUpdateRequest,
  cause: unknown,
  runtime: { log: (entry: ManagedUpdateLogEntry) => void; errorId: () => string },
): ManagedUpdateError {
  if (cause instanceof ManagedUpdateError && cause.errorId !== "") return cause;
  const code = managedUpdateErrorCode(cause);
  const errorId = runtime.errorId();
  runtime.log({
    code,
    errorId,
    repositoryId: request.repositoryId,
    version: request.version,
    trigger: request.trigger,
    outcome: "failed",
    cause,
  });
  return new ManagedUpdateError(code, { errorId, cause });
}

interface ReconcileContext {
  request: ManagedUpdateRequest;
  repository: GitHubRepositoryUpdateClient;
  files: GitHubManagedFile[];
  read: <T>(operation: () => Promise<T>) => Promise<T>;
  requiredCheckNames: readonly string[];
}

export function createManagedUpdateOrchestrator(
  options: ManagedUpdateOrchestratorOptions,
): ManagedUpdateOrchestrator {
  const requiredCheckNames = validateRequiredCheckNames(options.requiredCheckNames);
  const maxReadAttempts = options.maxReadAttempts ?? 3;
  if (
    !Number.isSafeInteger(maxReadAttempts) ||
    maxReadAttempts < 1 ||
    maxReadAttempts > MAX_READ_ATTEMPTS
  ) {
    throw new TypeError(`maxReadAttempts must be between 1 and ${MAX_READ_ATTEMPTS}.`);
  }
  const sleep = options.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
  const log = options.log ?? (() => undefined);
  const errorId = options.errorId ?? (() => randomUUID().replaceAll("-", ""));
  const queues = new Map<number, Promise<void>>();

  return {
    reconcile(request) {
      validateRequest(request);
      const previous = queues.get(request.repositoryId) ?? Promise.resolve();
      const operation = previous
        .catch(() => undefined)
        .then(() => reconcileManagedUpdate(options, request, {
          maxReadAttempts,
          requiredCheckNames,
          sleep,
        }))
        // Every failure leaves through here, so nothing internal can escape
        // the boundary uncoded, unlogged, or without an identifier to quote.
        .catch((cause: unknown) => {
          throw boundaryError(request, cause, { log, errorId });
        });
      const tail = operation.then(
        () => undefined,
        () => undefined,
      );
      queues.set(request.repositoryId, tail);
      void tail.finally(() => {
        if (queues.get(request.repositoryId) === tail) {
          queues.delete(request.repositoryId);
        }
      });
      return operation;
    },
  };
}

async function reconcileManagedUpdate(
  options: ManagedUpdateOrchestratorOptions,
  request: ManagedUpdateRequest,
  runtime: {
    maxReadAttempts: number;
    requiredCheckNames: readonly string[];
    sleep: (milliseconds: number) => Promise<void>;
  },
): Promise<ManagedUpdateResult> {
  const read = <T>(operation: () => Promise<T>) => retrySafeRead(
    operation,
    runtime.maxReadAttempts,
    runtime.sleep,
  );
  const [repository, release] = await Promise.all([
    read(() => options.github.forRepository(
      request.installationId,
      request.repositoryId,
    )),
    read(() => options.releases.get(request.version)),
  ]);
  const validation = validateVelvetReleaseManifest(release.manifest);
  if (!validation.success || validation.data.version !== request.version) {
    throw new ManagedUpdateError("UPDATE_RELEASE_INVALID", { errorId: "" });
  }
  if (isProtectedBranch(repository.repository.defaultBranch)) {
    return result(request, "failed", "protected_branch_target");
  }

  const [configurationFile, versionLockFile] = await Promise.all([
    read(() => repository.readConfiguration()),
    read(() => repository.readVersionLock()),
  ]);
  const parsedConfiguration = parseVelvetConfiguration(configurationFile.source);
  if (!parsedConfiguration.success) {
    throw new ManagedUpdateError("UPDATE_INSTALLATION_INVALID", { errorId: "" });
  }
  const configuration = parsedConfiguration.data;
  if (
    configuration.repository.owner.toLowerCase() !==
      repository.repository.owner.toLowerCase() ||
    configuration.repository.name !== repository.repository.name
  ) {
    throw new ManagedUpdateError("UPDATE_INSTALLATION_INVALID", { errorId: "" });
  }

  if (
    request.trigger === "automatic-security" &&
    !configuration.updates.automaticSecurityUpdates
  ) {
    return result(request, "skipped", "automatic_security_disabled");
  }
  if (
    request.trigger === "automatic-security" &&
    (!validation.data.automaticInstallEligible ||
      validation.data.releaseType !== "security")
  ) {
    return result(request, "skipped", "release_not_automatic");
  }

  const installed = versionLockFile.lock;
  const direction = compareVelvetSemanticVersions(
    validation.data.version,
    installed.installedVersion,
  );
  if (direction < 0) {
    return result(request, "skipped", "newer_version_installed");
  }
  if (
    compareVelvetSemanticVersions(
      installed.installedVersion,
      validation.data.compatibility.minimumInstalledVersion,
    ) < 0 ||
    (!validation.data.compatibility.configurationMigrationRequired &&
      validation.data.compatibility.configurationSchemaVersion !==
        installed.configurationSchemaVersion) ||
    (!validation.data.compatibility.dataMigrationRequired &&
      validation.data.compatibility.dataSchemaVersion !== installed.dataSchemaVersion)
  ) {
    return result(request, "skipped", "incompatible_release");
  }
  if (
    validation.data.compatibility.configurationMigrationRequired ||
    validation.data.compatibility.dataMigrationRequired
  ) {
    return result(request, "skipped", "migration_required");
  }

  const materialized = materializeManagedTemplateFiles({
    manifest: validation.data,
    configuration,
    sources: release.sources,
  });
  if (!materialized.success) {
    throw new ManagedUpdateError("UPDATE_RELEASE_INVALID", { errorId: "" });
  }
  const files = materialized.data.files.map(({ path, content }) => ({
    path,
    content,
  }));
  const context: ReconcileContext = {
    request,
    repository,
    files,
    read,
    requiredCheckNames: runtime.requiredCheckNames,
  };
  const pullRequests = await read(() => repository.pullRequests(request.version));
  if (pullRequests.length > 1) {
    return result(request, "failed", "repository_changed");
  }
  const pullRequest = pullRequests[0];
  if (pullRequest) {
    if (pullRequest.state === "open") {
      return reconcileOpenPullRequest(context, pullRequest);
    }
    if (pullRequest.mergedAt && pullRequest.mergeCommitSha) {
      return reconcileMergedUpdate(context, pullRequest);
    }
    return result(request, "failed", "update_closed", pullRequest);
  }

  if (direction === 0) {
    return result(request, "succeeded", "already_installed");
  }
  return prepareUpdate(context);
}

async function prepareUpdate(
  context: ReconcileContext,
): Promise<ManagedUpdateResult> {
  const { repository, request, read } = context;
  const defaultHead = await read(() => repository.defaultBranchHead());
  let branchHead = await read(() => repository.updateBranchHead(request.version));
  if (branchHead === null) {
    await repository.createUpdateBranch(request.version, defaultHead);
    branchHead = defaultHead;
  }
  if (branchHead === defaultHead) {
    branchHead = await repository.commitUpdate(
      request.version,
      branchHead,
      context.files,
    );
  } else {
    const branchFiles = await read(() => repository.readManagedFiles(branchHead!));
    if (!sameFiles(branchFiles, context.files)) {
      return result(request, "failed", "repository_changed");
    }
  }
  const pullRequest = await repository.createPullRequest(
    request.version,
    branchHead,
    defaultHead,
  );
  return result(request, "waiting_for_checks", undefined, pullRequest);
}

async function reconcileOpenPullRequest(
  context: ReconcileContext,
  pullRequest: GitHubUpdatePullRequest,
): Promise<ManagedUpdateResult> {
  const { repository, request, read } = context;
  const [defaultHead, branchFiles] = await Promise.all([
    read(() => repository.defaultBranchHead()),
    read(() => repository.readManagedFiles(pullRequest.headSha)),
  ]);
  if (
    defaultHead !== pullRequest.baseSha ||
    !sameFiles(branchFiles, context.files)
  ) {
    return result(request, "failed", "repository_changed", pullRequest);
  }
  const checks = await read(() => repository.checkRuns(pullRequest.headSha));
  const checkState = requiredChecksState(checks, context.requiredCheckNames);
  if (checkState === "waiting") {
    return result(request, "waiting_for_checks", undefined, pullRequest);
  }
  if (checkState === "failed") {
    return result(request, "failed", "checks_failed", pullRequest);
  }

  // Ownership is proven immediately before the merge so that no change can slip
  // into the pull request between the proof and the mutation it authorizes.
  const changedPaths = await read(() => repository.changedPaths(pullRequest.number));
  if (protectedChangedPaths(changedPaths).length > 0) {
    return result(request, "failed", "protected_files_changed", pullRequest);
  }
  const dataBranchBeforeMerge = await read(() => repository.dataBranchHead());

  const merge = await repository.mergePullRequest(
    pullRequest.number,
    request.version,
    pullRequest.headSha,
  );
  if (!merge.merged || merge.sha === null) {
    return result(request, "failed", "merge_rejected", pullRequest);
  }
  if (dataBranchBeforeMerge !== null) {
    // The monitor rewrites this branch on its own schedule, including elder
    // history compaction that replaces it with an unrelated root commit. Only
    // its disappearance proves that the update destroyed protected history.
    const dataBranchAfterMerge = await read(() => repository.dataBranchHead());
    if (dataBranchAfterMerge === null) {
      return result(request, "failed", "data_branch_changed", pullRequest);
    }
  }
  return reconcileMergedUpdate(context, {
    ...pullRequest,
    state: "closed",
    mergedAt: new Date().toISOString(),
    mergeCommitSha: merge.sha,
  });
}

async function reconcileMergedUpdate(
  context: ReconcileContext,
  pullRequest: GitHubUpdatePullRequest,
): Promise<ManagedUpdateResult> {
  const { repository, request, read } = context;
  const [defaultHead, previousFiles] = await Promise.all([
    read(() => repository.defaultBranchHead()),
    read(() => repository.readManagedFiles(pullRequest.baseSha)),
  ]);
  const currentFiles = await read(() => repository.readManagedFiles(defaultHead));
  if (sameFiles(currentFiles, context.files)) {
    const publication = await publicationState(repository, defaultHead, read);
    if (publication === "missing") {
      await repository.dispatchPagesWorkflow(defaultHead);
      return result(
        request,
        "waiting_for_publication",
        undefined,
        pullRequest,
      );
    }
    if (publication === "waiting") {
      return result(
        request,
        "waiting_for_publication",
        undefined,
        pullRequest,
      );
    }
    if (publication === "succeeded") {
      const cleaned = await cleanupBranch(context, pullRequest);
      return cleaned
        ? result(request, "succeeded", undefined, pullRequest)
        : result(request, "failed", "repository_changed", pullRequest);
    }
    await repository.commitRevert(
      request.version,
      defaultHead,
      previousFiles,
    );
    return result(request, "restoring", undefined, pullRequest);
  }

  if (sameFiles(currentFiles, previousFiles)) {
    const recovery = await publicationState(repository, defaultHead, read);
    if (recovery === "missing") {
      await repository.dispatchPagesWorkflow(defaultHead);
      return result(request, "waiting_for_recovery", undefined, pullRequest);
    }
    if (recovery === "waiting") {
      return result(request, "waiting_for_recovery", undefined, pullRequest);
    }
    const cleaned = await cleanupBranch(context, pullRequest);
    if (!cleaned) {
      return result(request, "failed", "repository_changed", pullRequest);
    }
    return recovery === "succeeded"
      ? result(request, "restored", undefined, pullRequest)
      : result(request, "failed", "recovery_failed", pullRequest);
  }
  return result(request, "failed", "repository_changed", pullRequest);
}

async function publicationState(
  repository: GitHubRepositoryUpdateClient,
  headSha: string,
  read: <T>(operation: () => Promise<T>) => Promise<T>,
): Promise<"missing" | "waiting" | "succeeded" | "failed"> {
  const runs = await read(() => repository.pagesWorkflowRuns(headSha));
  if (runs.length === 0) return "missing";
  if (runs.some(successfulWorkflowRun)) return "succeeded";
  if (runs.some((run) => run.status !== "completed")) return "waiting";
  return "failed";
}

function successfulWorkflowRun(run: GitHubUpdateWorkflowRun): boolean {
  return run.status === "completed" && run.conclusion === "success";
}

async function cleanupBranch(
  context: ReconcileContext,
  pullRequest: GitHubUpdatePullRequest,
): Promise<boolean> {
  const branchHead = await context.read(() =>
    context.repository.updateBranchHead(context.request.version)
  );
  if (branchHead === null) return true;
  if (branchHead !== pullRequest.headSha) return false;
  await context.repository.deleteUpdateBranch(
    context.request.version,
    pullRequest.headSha,
  );
  return true;
}

function requiredChecksState(
  checks: readonly GitHubUpdateCheckRun[],
  requiredNames: readonly string[],
): "waiting" | "succeeded" | "failed" {
  for (const name of requiredNames) {
    const check = checks.find((candidate) => candidate.name === name);
    if (!check || check.status !== "completed") return "waiting";
    if (check.conclusion !== "success") return "failed";
  }
  return "succeeded";
}

function sameFiles(
  left: readonly GitHubManagedFile[],
  right: readonly GitHubManagedFile[],
): boolean {
  if (left.length !== right.length) return false;
  const rightByPath = new Map(right.map((file) => [file.path, file.content]));
  return left.every((file) => rightByPath.get(file.path) === file.content);
}

async function retrySafeRead<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts || !retryableReadError(error)) throw error;
      const retryAfter = error instanceof GitHubApiError
        ? error.retryAfterSeconds
        : null;
      const delay = retryAfter === null
        ? 250 * 2 ** (attempt - 1)
        : Math.min(retryAfter * 1_000, 5_000);
      await sleep(delay);
    }
  }
  throw new Error("Unreachable managed-update retry state.");
}

function retryableReadError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return error instanceof GitHubApiError &&
    (error.status === 429 ||
      error.status === 502 ||
      error.status === 503 ||
      error.status === 504 ||
      (error.status === 403 && error.retryAfterSeconds !== null));
}

function validateRequiredCheckNames(names: readonly string[]): string[] {
  if (
    names.length === 0 ||
    new Set(names).size !== names.length ||
    names.some((name) => name.length === 0 || name.length > 256)
  ) {
    throw new TypeError("Managed updates require unique named checks.");
  }
  return [...names];
}

function validateRequest(request: ManagedUpdateRequest): void {
  if (
    !positiveInteger(request.installationId) ||
    !positiveInteger(request.repositoryId) ||
    !SEMANTIC_VERSION.test(request.version) ||
    (request.trigger !== "manual" && request.trigger !== "automatic-security")
  ) {
    throw new TypeError("Managed update request is invalid.");
  }
}

function result(
  request: ManagedUpdateRequest,
  state: ManagedUpdateState,
  reason?: ManagedUpdateReason,
  pullRequest?: GitHubUpdatePullRequest,
): ManagedUpdateResult {
  return {
    operationId: `repository:${request.repositoryId}:velvet:${request.version}`,
    version: request.version,
    trigger: request.trigger,
    state,
    ...(reason ? { reason } : {}),
    ...(pullRequest
      ? {
          pullRequest: {
            number: pullRequest.number,
            htmlUrl: pullRequest.htmlUrl,
          },
        }
      : {}),
  };
}
