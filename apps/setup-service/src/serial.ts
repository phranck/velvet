import {
  createGitHubAppJwt,
  createGitHubRequest,
  createInstallationToken,
  createRepositoryInstallationToken,
  GitHubApiError,
  readBoundedJson,
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
 * The tally is also plainly auditable this way, because every increment is a
 * commit.
 */

/** The shape stored in the counter file. */
export interface SerialCounterState {
  schemaVersion: 1;
  /** How many serials have been handed out. The next one is this plus one. */
  issued: number;
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
   * Claims the next number and records it.
   *
   * @returns The claimed number.
   * @throws When the counter cannot be written within the permitted retries, so
   *   the caller decides whether an installation without a serial is acceptable
   *   rather than having that decided here.
   */
  claim(): Promise<number>;
}

interface RepositoryReference {
  owner: string;
  name: string;
}

/** Contents alone, which is all an increment needs. */
const COUNTER_PERMISSIONS = { contents: "write" } as const;

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
  const issued =
    typeof value === "object" && value !== null
      ? (value as { issued?: unknown }).issued
      : undefined;
  if (
    typeof issued !== "number" ||
    !Number.isSafeInteger(issued) ||
    issued < 0
  ) {
    throw new Error("The serial counter file is not a valid counter.");
  }
  return { schemaVersion: 1, issued };
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

  const writeToken = async (): Promise<string> => {
    cachedTarget ??= resolveTarget();
    let target: { installationId: number; repositoryId: number };
    try {
      target = await cachedTarget;
    } catch (error) {
      // A failed resolution must not poison every later attempt.
      cachedTarget = null;
      throw error;
    }
    return createRepositoryInstallationToken(
      { ...options },
      target.installationId,
      target.repositoryId,
      COUNTER_PERMISSIONS,
      options.userAgent,
    );
  };

  /**
   * Reads the counter without a token.
   *
   * The counter repository is public, so the raw endpoint serves it to an
   * anonymous request. Reading this way keeps the onboarding view off the App's
   * token budget, since it is read on every visit whilst a claim happens once
   * per installation.
   */
  const readPublicState = async (): Promise<SerialCounterState | null> => {
    const response = await fetchImplementation(
      new Request(
        `https://raw.githubusercontent.com/${repository.owner}/${repository.name}/HEAD/${options.path}`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": options.userAgent,
          },
        },
      ),
    );
    if (!response.ok) {
      await response.body?.cancel();
      // A counter that has never been written has issued nothing.
      return response.status === 404 ? { schemaVersion: 1, issued: 0 } : null;
    }
    try {
      return parseState(await readBoundedJson<unknown>(response));
    } catch {
      return null;
    }
  };

  /** Reads the counter through the API, which also yields the blob SHA. */
  const readForWrite = async (
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
      // First ever claim: the file does not exist, and a create carries no SHA.
      return { state: { schemaVersion: 1, issued: 0 }, sha: null };
    }
  };

  return {
    async peek() {
      try {
        const state = await readPublicState();
        return state ? state.issued + 1 : null;
      } catch {
        return null;
      }
    },

    async claim() {
      let lastConflict: unknown;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const token = await writeToken();
        const { state, sha } = await readForWrite(token);
        const next: SerialCounterState = {
          schemaVersion: 1,
          issued: state.issued + 1,
        };
        try {
          await githubRequest<unknown>(contentsPath, token, {
            method: "PUT",
            body: JSON.stringify({
              message: `Chore: issue installation serial ${next.issued}`,
              content: Buffer.from(serializeState(next), "utf8").toString("base64"),
              ...(sha ? { sha } : {}),
            }),
          });
          return next.issued;
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
