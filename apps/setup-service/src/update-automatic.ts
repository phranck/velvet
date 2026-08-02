import {
  parseVelvetVersionLock,
  type VelvetReleaseManifest,
} from "@velvet/contracts";

import {
  createGitHubAppJwt,
  createGitHubRequest,
  createInstallationToken,
  GitHubApiError,
  type GitHubAppApiOptions,
} from "./github-api.js";
import {
  managedUpdateErrorCode,
  type ManagedUpdateErrorCode,
} from "./update-error.js";
import type {
  ManagedUpdateOrchestrator,
  ManagedUpdateReleaseProvider,
  ManagedUpdateResult,
} from "./update-orchestrator-types.js";
import { isRecord, positiveInteger } from "./update-github-validation.js";

const AUTOMATIC_USER_AGENT = "velvet-update-service";
const PAGE_SIZE = 100;

/**
 * Pages read when enumerating installations or their repositories.
 *
 * A bound has to exist, because an unbounded walk over an account with a very
 * large number of repositories would spend a rate limit that the rest of the
 * service needs. Reaching it is reported rather than passed over silently.
 */
const MAX_PAGES = 20;

/** Times one repository is attempted for one version before it is left alone. */
const MAX_ATTEMPTS_PER_RELEASE = 3;

/**
 * What one sweep did.
 *
 * @property eligible - False when the release the service carries is not one
 *   that may install itself, in which case nothing else was even looked at.
 * @property truncated - True when a bound stopped the walk, so the counts
 *   below describe part of the estimate rather than all of it.
 */
export interface AutomaticUpdateSweep {
  eligible: boolean;
  version: string;
  installations: number;
  repositories: number;
  reconciled: ManagedUpdateResult[];
  failures: number;
  truncated: boolean;
}

export interface AutomaticUpdateRunner {
  /**
   * Installs the current release wherever it may install itself.
   *
   * Safe to call repeatedly. A sweep already in progress is returned rather
   * than started again, so a schedule that fires faster than a sweep completes
   * cannot pile them up.
   */
  run(): Promise<AutomaticUpdateSweep>;
}

/** One line per repository a sweep touched, safe for a shared log. */
export interface AutomaticUpdateRepositoryLogEntry {
  scope: "repository";
  installationId: number;
  repositoryId: number;
  version: string;
  outcome: "reconciled" | "skipped" | "failed" | "abandoned";
  state?: string;
  reason?: string;
  code?: ManagedUpdateErrorCode;
}

/**
 * One line per sweep, written whatever the sweep found.
 *
 * A sweep that finds nothing is the case worth seeing, because without a line
 * of its own it is indistinguishable from a schedule that has stopped firing.
 * That is the ordinary case too: most releases are not eligible security
 * releases, so most sweeps touch GitHub not at all and would otherwise be
 * silent for weeks at a time.
 */
export interface AutomaticUpdateSweepLogEntry {
  scope: "sweep";
  version: string;
  /** Whether the release was one that may install itself unattended. */
  eligible: boolean;
  installations: number;
  repositories: number;
  reconciled: number;
  failures: number;
  truncated: boolean;
  /** Set when the sweep threw, in which case the counts are what it reached. */
  code?: ManagedUpdateErrorCode;
}

export type AutomaticUpdateLogEntry =
  | AutomaticUpdateRepositoryLogEntry
  | AutomaticUpdateSweepLogEntry;

interface AutomaticUpdateRunnerOptions {
  app: GitHubAppApiOptions;
  releases: ManagedUpdateReleaseProvider;
  orchestrator: ManagedUpdateOrchestrator;
  log?: (entry: AutomaticUpdateLogEntry) => void;
}

/**
 * Installs eligible security releases without anyone asking.
 *
 * The expensive part is finding out which repositories exist, so the cheap
 * question is asked first: is the release the service carries one that may
 * install itself at all? Publication rules already guarantee that only a
 * migration-free security release can be marked eligible, so when the answer
 * is no, which is the ordinary case, this touches GitHub not at all.
 *
 * Whether a particular installation actually wants it is not decided here. The
 * orchestrator reads the owner's own preference from their configuration, so
 * there is one place that decision lives.
 */
export function createAutomaticUpdateRunner(
  options: AutomaticUpdateRunnerOptions,
): AutomaticUpdateRunner {
  const fetchImplementation = options.app.fetch ?? ((request) => fetch(request));
  const githubRequest = createGitHubRequest(
    fetchImplementation,
    AUTOMATIC_USER_AGENT,
  );
  const log = options.log ?? (() => undefined);
  // Keyed by repository and version, so a release that keeps failing for one
  // installation stops being retried whilst the next release starts clean.
  const attempts = new Map<string, number>();
  let active: Promise<AutomaticUpdateSweep> | null = null;

  const appJwt = (): string =>
    createGitHubAppJwt(
      options.app.appId,
      options.app.privateKey,
      options.app.nowSeconds,
    );

  /** Installation identifiers this app is installed on. */
  const installations = async (): Promise<{
    ids: number[];
    truncated: boolean;
  }> => {
    const ids: number[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const body = await githubRequest<unknown>(
        `/app/installations?per_page=${PAGE_SIZE}&page=${page}`,
        appJwt(),
      );
      if (!Array.isArray(body)) {
        throw new Error("GitHub installations response was invalid.");
      }
      for (const entry of body) {
        if (isRecord(entry) && positiveInteger(entry.id)) ids.push(entry.id);
      }
      if (body.length < PAGE_SIZE) return { ids, truncated: false };
    }
    return { ids, truncated: true };
  };

  /** Repositories one installation covers, as owner, name, and identifier. */
  const repositories = async (
    token: string,
  ): Promise<{
    entries: { id: number; owner: string; name: string }[];
    truncated: boolean;
  }> => {
    const entries: { id: number; owner: string; name: string }[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const body = await githubRequest<unknown>(
        `/installation/repositories?per_page=${PAGE_SIZE}&page=${page}`,
        token,
      );
      if (!isRecord(body) || !Array.isArray(body.repositories)) {
        throw new Error("GitHub installation repositories response was invalid.");
      }
      for (const entry of body.repositories) {
        if (
          isRecord(entry) &&
          positiveInteger(entry.id) &&
          typeof entry.name === "string" &&
          isRecord(entry.owner) &&
          typeof entry.owner.login === "string"
        ) {
          entries.push({
            id: entry.id,
            owner: entry.owner.login,
            name: entry.name,
          });
        }
      }
      if (body.repositories.length < PAGE_SIZE) {
        return { entries, truncated: false };
      }
    }
    return { entries, truncated: true };
  };

  /**
   * Whether a repository is a Velvet installation at all.
   *
   * Asked before reconciling so that a repository which simply is not one, and
   * there will be many, is passed over quietly instead of producing a failure
   * for every sweep.
   */
  const installedVersion = async (
    token: string,
    repository: { owner: string; name: string },
  ): Promise<string | null> => {
    let body: unknown;
    try {
      body = await githubRequest<unknown>(
        `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/contents/velvet.lock.json`,
        token,
      );
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
    if (
      !isRecord(body) ||
      body.type !== "file" ||
      body.encoding !== "base64" ||
      typeof body.content !== "string"
    ) {
      return null;
    }
    const parsed = parseVelvetVersionLock(
      Buffer.from(body.content.replace(/\s/gu, ""), "base64").toString("utf8"),
    );
    return parsed.success ? parsed.data.installedVersion : null;
  };

  const collect = async (): Promise<AutomaticUpdateSweep> => {
    const version = options.releases.latest();
    const release = await options.releases.get(version);
    const manifest = release.manifest as VelvetReleaseManifest;
    const empty: AutomaticUpdateSweep = {
      eligible: false,
      version,
      installations: 0,
      repositories: 0,
      reconciled: [],
      failures: 0,
      truncated: false,
    };
    if (
      !manifest.automaticInstallEligible ||
      manifest.releaseType !== "security"
    ) {
      return empty;
    }

    const found = await installations();
    const result: AutomaticUpdateSweep = {
      ...empty,
      eligible: true,
      installations: found.ids.length,
      truncated: found.truncated,
    };

    for (const installationId of found.ids) {
      // Read-only, because finding installations is all this token is for.
      const token = await createInstallationToken(
        { ...options.app, fetch: fetchImplementation },
        installationId,
        { contents: "read", metadata: "read" },
        AUTOMATIC_USER_AGENT,
      );
      const covered = await repositories(token);
      result.truncated ||= covered.truncated;

      for (const repository of covered.entries) {
        result.repositories += 1;
        const key = `${repository.id}:${version}`;
        if ((attempts.get(key) ?? 0) >= MAX_ATTEMPTS_PER_RELEASE) {
          log({
            scope: "repository",
            installationId,
            repositoryId: repository.id,
            version,
            outcome: "abandoned",
          });
          continue;
        }
        const installed = await installedVersion(token, repository);
        if (installed === null) {
          log({
            scope: "repository",
            installationId,
            repositoryId: repository.id,
            version,
            outcome: "skipped",
          });
          continue;
        }

        try {
          const reconciled = await options.orchestrator.reconcile({
            installationId,
            repositoryId: repository.id,
            version,
            trigger: "automatic-security",
          });
          result.reconciled.push(reconciled);
          attempts.delete(key);
          log({
            scope: "repository",
            installationId,
            repositoryId: repository.id,
            version,
            outcome: "reconciled",
            state: reconciled.state,
            ...(reconciled.reason ? { reason: reconciled.reason } : {}),
          });
        } catch (cause) {
          // One installation failing is not a reason to leave every other one
          // without a security release.
          result.failures += 1;
          attempts.set(key, (attempts.get(key) ?? 0) + 1);
          log({
            scope: "repository",
            installationId,
            repositoryId: repository.id,
            version,
            outcome: "failed",
            code: managedUpdateErrorCode(cause),
          });
        }
      }
    }

    return result;
  };

  /*
   * Every path out of a sweep leaves exactly one summary line, including the
   * ordinary one where the release is not eligible and nothing is touched at
   * all. Wrapping `collect` rather than logging at each return is what makes
   * that true by construction: a return added later cannot forget to report.
   */
  const sweep = async (): Promise<AutomaticUpdateSweep> => {
    try {
      const result = await collect();
      log({
        scope: "sweep",
        version: result.version,
        eligible: result.eligible,
        installations: result.installations,
        repositories: result.repositories,
        reconciled: result.reconciled.length,
        failures: result.failures,
        truncated: result.truncated,
      });
      return result;
    } catch (cause) {
      // A sweep that threw is the one most worth seeing, so it is reported
      // before the failure travels on to whoever scheduled it.
      log({
        scope: "sweep",
        version: options.releases.latest(),
        eligible: false,
        installations: 0,
        repositories: 0,
        reconciled: 0,
        failures: 1,
        truncated: false,
        code: managedUpdateErrorCode(cause),
      });
      throw cause;
    }
  };

  return {
    run() {
      if (active) return active;
      const operation = sweep();
      active = operation;
      void operation.then(
        () => {
          if (active === operation) active = null;
        },
        () => {
          if (active === operation) active = null;
        },
      );
      return operation;
    },
  };
}
