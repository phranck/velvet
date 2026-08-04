import {
  parseVelvetConfiguration,
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
import type { InstallationSerialCounter } from "./serial.js";
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

  /**
   * Brings the registry's gallery consent back in step with the installations.
   *
   * Separate from {@link run} because that one answers the cheap question first
   * and stops when the release cannot install itself, which is the ordinary
   * state. Consent has to be read whether or not a release is pending, so
   * hanging it off that sweep would leave a withdrawal in place for as long as
   * no security release happened to be published.
   */
  reconcileGallery(): Promise<GalleryReconciliation>;
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
  /**
   * The registry the gallery reconciliation writes to.
   *
   * Absent on an instance without one, in which case nothing is reconciled and
   * the gallery endpoint reports nothing, exactly as it does for an instance
   * that has issued no serials.
   */
  serials?: InstallationSerialCounter;
}

/** What one pass over the installations found out about gallery consent. */
export interface GalleryReconciliation {
  /** Installations the app is on. */
  installations: number;
  /** Repositories examined. */
  repositories: number;
  /** Records whose consent differed from the installation and was corrected. */
  changed: number;
  /**
   * Records unlisted because the pass never reached them.
   *
   * A repository the app no longer covers is one whose consent Velvet cannot
   * read, whether it was deleted or the app was removed from it, and consent
   * that cannot be verified is not acted on.
   */
  unreachable: number;
  /** Repositories that could not be read at all. */
  failures: number;
  /** Whether the enumeration hit its page limit. */
  truncated: boolean;
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

  /**
   * What an installation's own configuration says about the gallery.
   *
   * `velvet.yml` belongs to the owner and is never written by an update, so it
   * is the only place the answer lives. A repository without one, or with one
   * that no longer parses, counts as no consent, because appearing publicly is
   * something a person opts into rather than something inferred.
   *
   * @returns `true` only when the file explicitly says so.
   */
  const galleryConsent = async (
    token: string,
    repository: { owner: string; name: string },
  ): Promise<boolean> => {
    let body: unknown;
    try {
      body = await githubRequest<unknown>(
        `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/contents/velvet.yml`,
        token,
      );
    } catch (error) {
      if (error instanceof GitHubApiError && error.status === 404) return false;
      throw error;
    }
    if (
      !isRecord(body) ||
      body.type !== "file" ||
      body.encoding !== "base64" ||
      typeof body.content !== "string"
    ) {
      return false;
    }
    const parsed = parseVelvetConfiguration(
      Buffer.from(body.content.replace(/\s/gu, ""), "base64").toString("utf8"),
    );
    return parsed.success && parsed.data.gallery?.listed === true;
  };

  const reconcileGallery = async (): Promise<GalleryReconciliation> => {
    const result: GalleryReconciliation = {
      installations: 0,
      repositories: 0,
      changed: 0,
      unreachable: 0,
      failures: 0,
      truncated: false,
    };
    const serials = options.serials;
    if (!serials) return result;

    const found = await installations();
    result.installations = found.ids.length;
    result.truncated = found.truncated;
    /** Every repository this pass actually reached, to compare the registry against. */
    const visited = new Set<string>();

    for (const installationId of found.ids) {
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
        const name = `${repository.owner}/${repository.name}`;
        visited.add(name);
        try {
          const consented = await galleryConsent(token, repository);
          const written = await serials.setListed(name, consented);
          if (written) result.changed += 1;
        } catch {
          // One unreadable repository is not a reason to leave every other
          // installation's consent stale.
          result.failures += 1;
        }
      }
    }

    /*
     * The other direction. Walking the app's repositories finds an installation
     * that withdrew its consent, and never finds one that is gone: a deleted
     * repository, or one the app was removed from, is simply absent from that
     * list, so nothing about it is ever revisited and it stays listed forever.
     *
     * An entry the pass did not reach is one whose consent Velvet can no longer
     * read, and consent that cannot be verified is not acted on.
     *
     * Only from a complete pass. A truncated enumeration or a repository that
     * failed to be read means the list of what was reached is incomplete, and
     * absence from an incomplete list is no evidence at all. A bad afternoon at
     * GitHub would otherwise empty the gallery.
     */
    if (!result.truncated && result.failures === 0) {
      const listed = await serials.listedRepositories();
      for (const repository of listed ?? []) {
        if (visited.has(repository)) continue;
        if (await serials.setListed(repository, false)) result.unreachable += 1;
      }
    }

    return result;
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

    reconcileGallery,
  };
}
