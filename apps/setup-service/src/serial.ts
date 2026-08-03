import {
  createGitHubAppJwt,
  createGitHubRequest,
  createInstallationToken,
  createRepositoryInstallationToken,
  GitHubApiError,
  type GitHubAppApiOptions,
} from "./github-api.js";

/**
 * The running number every completed installation receives.
 *
 * Kept in a JSON file in a repository the App can write, rather than in a
 * database, because the service has no datastore and a single integer is a poor
 * reason to introduce one. GitHub's Contents API takes the current blob SHA as a
 * precondition, which makes an increment atomic: two installations finishing at
 * the same moment cannot both claim the same number, since the second write is
 * rejected and retried against the value the first one left behind.
 *
 * Two consequences of where it lives are worth stating, because both shaped this
 * code:
 *
 * The repository is **private**, so reading needs a token exactly as writing
 * does. Once the file grows past a bare count, as the gallery in issue 156
 * intends, it lists installations that never agreed to be named, and a tally of
 * every installation is not something to leave open either.
 *
 * The repository is `phranck/velvet-registry`. It is **not** `phranck/velvet`. That repository ships the Actions every
 * installation runs, so it has to stay public, and a push to its default branch
 * starts the whole CI suite. Writing a counter there would also hand the service
 * write access to the product's own source.
 *
 * The tally stays plainly auditable regardless, because every increment is a
 * commit.
 */

/**
 * One installation, as recorded when its serial was issued.
 *
 * These are the answers from onboarding's first step, which is what identifies
 * an installation to a human reading the file. They are personal data, since a
 * GitHub account names a person, which is why the counter repository is private
 * and why appearing in a public gallery is a separate decision the owner makes.
 */
export interface SerialInstallationRecord {
  /** The number this installation received. */
  serial: number;
  /** The repository created for it, as `owner/name`. */
  repository: string;
  /** The public name shown on the status page. */
  statusPageName: string;
  /** Where the status page is published. */
  url: string;
  /** Present only when the owner supplied one. */
  customDomain?: string;
  /** When the serial was issued, as an ISO 8601 instant. */
  issuedAt: string;
  /**
   * Whether the owner agreed to appear in the public gallery.
   *
   * Absent means no. Consent is recorded in the installation's own `velvet.yml`
   * as `gallery.listed`, and this is the copy the service keeps so a public
   * endpoint can answer without reading every installation on every request.
   * It is only ever written from what that file says, so withdrawing there
   * removes the entry here on the next reconciliation.
   */
  listed?: boolean;
}

/** What the public gallery is allowed to disclose about an installation. */
export interface GalleryEntry {
  /** The public name shown on the status page. */
  statusPageName: string;
  /** Where the status page is published. */
  url: string;
}

/** What onboarding knows about an installation when it claims a serial. */
export type SerialInstallationDetails = Omit<
  SerialInstallationRecord,
  "serial" | "issuedAt"
>;

/**
 * The shape stored in the counter file.
 *
 * `issued` is kept alongside the list rather than derived from its length,
 * because a record removed later, whether at the owner's request or because the
 * repository is gone, must not hand its number to somebody else.
 */
export interface SerialCounterState {
  schemaVersion: 1;
  /** How many serials have been handed out. The next one is this plus one. */
  issued: number;
  /** Every installation that has received one, oldest first. */
  installations: SerialInstallationRecord[];
}

export interface SerialCounterOptions extends GitHubAppApiOptions {
  /** The counter's repository, as `owner/name`. */
  repository: string;
  /** Path to the counter file inside that repository. */
  path: string;
  userAgent: string;
  /**
   * How many times to retry a rejected write.
   *
   * Each retry re-reads the file, so this bounds how much contention is
   * tolerated before a serial is refused rather than silently duplicated.
   */
  maxAttempts?: number;
}

export interface InstallationSerialCounter {
  /**
   * The number the next installation would receive.
   *
   * Provisional by nature: it is what the counter says right now, and two
   * visitors looking at once see the same value. Nothing is reserved, so the
   * number a setup actually receives is settled by {@link claim}.
   *
   * @returns The next number, or `null` when the counter cannot be read, since
   *   a backdrop with no number is better than one with a wrong number.
   */
  peek(): Promise<number | null>;

  /**
   * Claims the next number and records the installation against it.
   *
   * @param installation - What onboarding knows about it, from the first step.
   * @returns The claimed number.
   * @throws When the counter cannot be written within the permitted retries, so
   *   the caller decides whether an installation without a serial is acceptable
   *   rather than having that decided here.
   */
  claim(installation: SerialInstallationDetails): Promise<number>;

  /**
   * The installations whose owners agreed to appear publicly.
   *
   * Carries only the page name and its address. Everything else the registry
   * holds, including the repository and the account behind it, identifies a
   * person and never leaves the private counter.
   *
   * @returns The consenting entries, oldest first, or `null` when the counter
   *   cannot be read. A caller shows nothing in that case rather than an empty
   *   gallery, since the two mean different things.
   */
  listed(): Promise<GalleryEntry[] | null>;

  /**
   * Records what an installation's own configuration says about the gallery.
   *
   * Writing only when the answer differs keeps a reconciliation that finds
   * nothing changed from touching the counter at all, which is the ordinary
   * case once every installation has been seen once.
   *
   * @param repository - The installation, as `owner/name`.
   * @param listed - What `gallery.listed` says, or `false` when it says nothing.
   * @returns Whether the counter was written.
   */
  setListed(repository: string, listed: boolean): Promise<boolean>;
}

interface RepositoryReference {
  owner: string;
  name: string;
}

/** Contents alone, which is all an increment needs. */
const COUNTER_PERMISSIONS = { contents: "write" } as const;

/** GitHub issues installation tokens for an hour. */
const TOKEN_LIFETIME_SECONDS = 3_540;

/** Retired this far ahead of expiry, so no request starts on a dying token. */
const TOKEN_MARGIN_SECONDS = 120;

const REPOSITORY_REFERENCE =
  /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+)$/u;

/**
 * Splits an `owner/name` reference.
 *
 * @throws When the value is not exactly one owner and one repository name, so a
 *   misconfigured environment fails at start-up rather than at the first
 *   installation.
 */
export function parseSerialRepository(value: string): RepositoryReference {
  const match = value.trim().match(REPOSITORY_REFERENCE);
  if (!match) {
    throw new TypeError("The serial counter repository must read owner/name.");
  }
  return { owner: match[1]!, name: match[2]! };
}

function isMissing(error: unknown): boolean {
  return error instanceof GitHubApiError && error.status === 404;
}

/**
 * A rejected precondition, which is contention rather than a fault.
 *
 * GitHub answers a stale blob SHA with 409, and 422 when the SHA does not belong
 * to the path at all, which is what happens when the file was replaced between
 * the read and the write.
 */
function isConflict(error: unknown): boolean {
  return (
    error instanceof GitHubApiError &&
    (error.status === 409 || error.status === 422)
  );
}

function parseState(value: unknown): SerialCounterState {
  const record =
    typeof value === "object" && value !== null
      ? (value as { issued?: unknown; installations?: unknown })
      : {};
  const issued = record.issued;
  if (
    typeof issued !== "number" ||
    !Number.isSafeInteger(issued) ||
    issued < 0
  ) {
    throw new Error("The serial counter file is not a valid counter.");
  }
  // A file written before the list existed still counts, so an absent list is
  // read as an empty one rather than rejected.
  const installations = Array.isArray(record.installations)
    ? (record.installations as SerialInstallationRecord[])
    : [];
  if (installations.some((entry) => typeof entry?.serial !== "number")) {
    throw new Error("The serial counter file holds an invalid installation.");
  }
  return { schemaVersion: 1, issued, installations };
}

function serializeState(state: SerialCounterState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

function readNumericId(value: unknown, message: string): number {
  const id =
    typeof value === "object" && value !== null
      ? (value as { id?: unknown }).id
      : undefined;
  if (typeof id !== "number" || !Number.isSafeInteger(id)) {
    throw new Error(message);
  }
  return id;
}

/**
 * Builds the counter.
 *
 * @param options - Repository, path, and App credentials.
 * @returns A counter that can report and claim numbers.
 */
export function createInstallationSerialCounter(
  options: SerialCounterOptions,
): InstallationSerialCounter {
  const repository = parseSerialRepository(options.repository);
  const fetchImplementation = options.fetch ?? ((request) => fetch(request));
  const githubRequest = createGitHubRequest(fetchImplementation, options.userAgent);
  const nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1_000));
  const maxAttempts = options.maxAttempts ?? 4;
  const repositoryPath = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}`;
  const contentsPath = `${repositoryPath}/contents/${options.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;

  /**
   * Resolved once per process, since neither identifier changes for the life of
   * the counter repository.
   */
  let cachedTarget:
    | Promise<{ installationId: number; repositoryId: number }>
    | null = null;

  const resolveTarget = async (): Promise<{
    installationId: number;
    repositoryId: number;
  }> => {
    const appJwt = createGitHubAppJwt(
      options.appId,
      options.privateKey,
      options.nowSeconds,
    );
    const installationId = readNumericId(
      await githubRequest<unknown>(`${repositoryPath}/installation`, appJwt),
      "Velvet is not installed on the serial counter repository.",
    );
    // A broad token only to learn the repository's numeric id, so that the token
    // which actually writes can be scoped to that one repository.
    const enumerationToken = await createInstallationToken(
      { ...options },
      installationId,
      COUNTER_PERMISSIONS,
      options.userAgent,
    );
    const repositoryId = readNumericId(
      await githubRequest<unknown>(repositoryPath, enumerationToken),
      "The serial counter repository response was invalid.",
    );
    return { installationId, repositoryId };
  };

  /**
   * A cached token, with the moment it stops being usable.
   *
   * GitHub issues installation tokens for an hour. The counter repository is
   * private, so reading it needs one too, and onboarding reads it on every
   * visit. Minting a token per visit would cost three round trips each time for
   * no benefit. The margin expires the cache early rather than risk handing out
   * a token that dies mid-request.
   */
  let cachedToken: { value: string; expiresAtSeconds: number } | null = null;

  const repositoryToken = async (): Promise<string> => {
    const now = nowSeconds();
    if (cachedToken && cachedToken.expiresAtSeconds > now) return cachedToken.value;

    cachedTarget ??= resolveTarget();
    let target: { installationId: number; repositoryId: number };
    try {
      target = await cachedTarget;
    } catch (error) {
      // A failed resolution must not poison every later attempt.
      cachedTarget = null;
      throw error;
    }
    const value = await createRepositoryInstallationToken(
      { ...options },
      target.installationId,
      target.repositoryId,
      COUNTER_PERMISSIONS,
      options.userAgent,
    );
    cachedToken = {
      value,
      expiresAtSeconds: now + TOKEN_LIFETIME_SECONDS - TOKEN_MARGIN_SECONDS,
    };
    return value;
  };

  /**
   * Reads the counter through the API, which also yields the blob SHA the write
   * needs as its precondition.
   *
   * A counter file that does not exist yet has issued nothing, which is the
   * state a first claim increments from.
   */
  const readState = async (
    token: string,
  ): Promise<{ state: SerialCounterState; sha: string | null }> => {
    try {
      const body = await githubRequest<unknown>(contentsPath, token);
      const record =
        typeof body === "object" && body !== null
          ? (body as { content?: unknown; sha?: unknown })
          : {};
      if (typeof record.content !== "string" || typeof record.sha !== "string") {
        throw new Error("The serial counter contents response was invalid.");
      }
      const decoded = Buffer.from(record.content, "base64").toString("utf8");
      return { state: parseState(JSON.parse(decoded)), sha: record.sha };
    } catch (error) {
      if (!isMissing(error)) throw error;
      // A create carries no precondition, since there is no blob to match.
      return { state: { schemaVersion: 1, issued: 0, installations: [] }, sha: null };
    }
  };

  return {
    async peek() {
      try {
        const { state } = await readState(await repositoryToken());
        return state.issued + 1;
      } catch {
        // A backdrop with no number is better than one with a wrong number, so
        // an unreadable counter is reported as absent rather than as zero.
        return null;
      }
    },

    async claim(installation) {
      let lastConflict: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const token = await repositoryToken();
        const { state, sha } = await readState(token);
        const serial = state.issued + 1;
        const next: SerialCounterState = {
          schemaVersion: 1,
          issued: serial,
          installations: [
            ...state.installations,
            {
              serial,
              repository: installation.repository,
              statusPageName: installation.statusPageName,
              url: installation.url,
              ...(installation.customDomain
                ? { customDomain: installation.customDomain }
                : {}),
              issuedAt: new Date(nowSeconds() * 1_000).toISOString(),
            },
          ],
        };
        try {
          await githubRequest<unknown>(contentsPath, token, {
            method: "PUT",
            body: JSON.stringify({
              message: `Chore: issue serial ${serial} to ${installation.repository}`,
              content: Buffer.from(serializeState(next), "utf8").toString("base64"),
              ...(sha ? { sha } : {}),
            }),
          });
          return serial;
        } catch (error) {
          if (!isConflict(error)) throw error;
          lastConflict = error;
        }
      }
      throw new Error(
        `The serial counter could not be updated after ${maxAttempts} attempts.`,
        { cause: lastConflict },
      );
    },

    async listed() {
      try {
        const { state } = await readState(await repositoryToken());
        return state.installations
          .filter((installation) => installation.listed === true)
          .map(({ statusPageName, url }) => ({ statusPageName, url }));
      } catch {
        // Unreadable is not the same as empty, and the caller shows nothing
        // rather than an empty gallery when it cannot tell which it is.
        return null;
      }
    },

    async setListed(repository, listed) {
      let lastConflict: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const token = await repositoryToken();
        const { state, sha } = await readState(token);
        const current = state.installations.find(
          (installation) => installation.repository === repository,
        );
        // An installation with no record was never issued a serial, so there is
        // nothing to mark and nothing to report as changed.
        if (!current) return false;
        if ((current.listed === true) === listed) return false;

        const next: SerialCounterState = {
          ...state,
          installations: state.installations.map((installation) =>
            installation.repository === repository
              ? listed
                ? { ...installation, listed: true }
                : withoutListed(installation)
              : installation,
          ),
        };
        try {
          await githubRequest<unknown>(contentsPath, token, {
            method: "PUT",
            body: JSON.stringify({
              message: `Chore: ${listed ? "list" : "unlist"} ${repository}`,
              content: Buffer.from(serializeState(next), "utf8").toString("base64"),
              ...(sha ? { sha } : {}),
            }),
          });
          return true;
        } catch (error) {
          if (!isConflict(error)) throw error;
          lastConflict = error;
        }
      }
      throw new Error(
        `The serial counter could not be updated after ${maxAttempts} attempts.`,
        { cause: lastConflict },
      );
    },
  };
}

/**
 * Drops the consent flag rather than storing a false.
 *
 * Absent and false mean the same thing, and keeping only one of the two spellings
 * means a record cannot say one thing by its presence and another by its value.
 */
function withoutListed(
  installation: SerialInstallationRecord,
): SerialInstallationRecord {
  const rest = { ...installation };
  delete rest.listed;
  return rest;
}
