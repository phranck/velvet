import {
  MANAGED_UPDATE_REASONS,
  MANAGED_UPDATE_STATES,
  type ManagedUpdateReason,
  type ManagedUpdateState,
} from "@velvet/contracts";

/**
 * Talks to the Velvet service about one person's installations.
 *
 * Kept separate from the setup client because the two have different
 * lifetimes: setup runs once and then never again, whilst update information
 * is read repeatedly for as long as an installation exists.
 *
 * Every response is validated rather than trusted, because it drives what a
 * user is told about their own status page. An unusable body is reported as
 * unavailable, so the interface shows nothing instead of showing something
 * wrong.
 */

const MAX_RESPONSE_BYTES = 256 * 1_024;
const RELEASE_TYPES = ["security", "fix", "feature"];
const SEMANTIC_VERSION = /^\d+\.\d+\.\d+/u;

/** Which repository, through which installation, a request concerns. */
export interface InstallationSelector {
  installationId: number;
  repositoryId: number;
}

/** One repository the signed-in user can manage Velvet in. */
export interface ManagedInstallation extends InstallationSelector {
  owner: string;
  name: string;
  htmlUrl: string;
  /** `null` when the repository carries no version lock and cannot be updated. */
  installedVersion: string | null;
}

/**
 * @property truncated - True when the service stopped short of inspecting
 *   every repository, so a missing one is not proof of its absence.
 */
export interface InstallationDirectory {
  repositories: ManagedInstallation[];
  truncated: boolean;
}

/** What Velvet knows about one installation and the release it can install. */
export interface InstallationUpdate {
  repository: ManagedInstallation;
  installedVersion: string | null;
  automaticSecurityUpdates: boolean;
  availableVersion: string;
  releaseType: "security" | "fix" | "feature";
  automaticInstallEligible: boolean;
  releaseNotes: string;
}

/** Where one update operation stands, as the service last saw it. */
export interface UpdateOperation {
  operationId: string;
  version: string;
  state: ManagedUpdateState;
  reason?: ManagedUpdateReason;
  pullRequest?: { number: number; htmlUrl: string };
}

/**
 * What can come back from the service.
 *
 * `unavailable` and `unauthenticated` are separate cases rather than errors,
 * and separate from each other. No service at all is the normal state of a
 * Configurator opened from a computer, whilst a service that answers but does
 * not know who you are is one sign-in away from working. Collapsing the two
 * would mean telling somebody to go somewhere they already are.
 */
export type UpdateResult<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable" }
  | { status: "unauthenticated" }
  | { status: "error"; code: string; message: string; errorId: string };

export type UpdateFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface VelvetUpdateClient {
  /** Lists what the signed-in user may manage, for choosing between them. */
  listInstallations(): Promise<UpdateResult<InstallationDirectory>>;
  /** Reads the installed version, the preference, and the available release. */
  read(selector: InstallationSelector): Promise<UpdateResult<InstallationUpdate>>;
  /**
   * Moves one installation towards a version, and reports where it now stands.
   *
   * Calling this repeatedly is both how an update is retried and how it is
   * followed, because the service reconciles from the repository's own state
   * rather than from anything it remembers between calls.
   */
  start(
    selector: InstallationSelector,
    version: string,
  ): Promise<UpdateResult<UpdateOperation>>;
  /** Turns automatic installation of safe security releases on or off. */
  setAutomatic(
    selector: InstallationSelector,
    enabled: boolean,
  ): Promise<UpdateResult<boolean>>;
}

/**
 * Builds the client the Configurator uses to manage an installation.
 *
 * @param fetchImplementation - Injected for testing.
 * @param origin - Where the service is. Empty means the page's own origin,
 *   which is the case whenever the Configurator is served by the service.
 */
export function createUpdateClient(
  fetchImplementation: UpdateFetch = globalThis.fetch,
  origin = "",
): VelvetUpdateClient {
  /**
   * Reads the CSRF token the service expects on every write.
   *
   * A service that answers without an authenticated session is reported as
   * such, so the interface can offer a sign-in rather than claiming nothing is
   * there.
   */
  const csrfToken = async (): Promise<UpdateResult<string>> => {
    const response = await request("GET", "/api/session");
    if (response === null) return { status: "unavailable" };
    if (!response.ok) return { status: "unauthenticated" };
    const body = record(await readJson(response));
    if (!body || body.authenticated !== true) {
      return { status: "unauthenticated" };
    }
    return typeof body.csrfToken === "string" && body.csrfToken.length > 0
      ? { status: "ok", data: body.csrfToken }
      : { status: "unavailable" };
  };

  const request = async (
    method: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response | null> => {
    try {
      return await fetchImplementation(`${origin}${path}`, {
        method,
        credentials: "include",
        ...init,
        headers: { Accept: "application/json", ...init.headers },
      });
    } catch {
      return null;
    }
  };

  /** Runs one call and reduces it to the three outcomes callers handle. */
  const call = async <T>(
    method: string,
    path: string,
    parse: (body: unknown) => T | null,
    body?: unknown,
  ): Promise<UpdateResult<T>> => {
    let init: RequestInit = {};
    if (body !== undefined) {
      const token = await csrfToken();
      if (token.status !== "ok") return token;
      init = {
        headers: {
          "Content-Type": "application/json",
          "X-Velvet-CSRF": token.data,
        },
        body: JSON.stringify(body),
      };
    }
    const response = await request(method, path, init);
    if (response === null) return { status: "unavailable" };
    if (response.status === 401) return { status: "unauthenticated" };

    const payload = await readJson(response);
    if (!response.ok) return failure(payload);
    const parsed = payload === null ? null : parse(payload);
    return parsed === null ? { status: "unavailable" } : { status: "ok", data: parsed };
  };

  return {
    listInstallations() {
      return call("GET", "/api/installations", parseDirectory);
    },

    read(selector) {
      const query = new URLSearchParams({
        installation: String(selector.installationId),
        repository: String(selector.repositoryId),
      });
      return call("GET", `/api/updates?${query.toString()}`, parseUpdate);
    },

    start(selector, version) {
      return call("POST", "/api/updates", parseOperation, {
        ...selector,
        version,
      });
    },

    setAutomatic(selector, enabled) {
      return call(
        "POST",
        "/api/updates/automatic",
        (body) => {
          const value = record(body)?.automaticSecurityUpdates;
          return typeof value === "boolean" ? value : null;
        },
        { ...selector, enabled },
      );
    },
  };
}

/**
 * Reduces a failed response to the reportable error shape.
 *
 * A body the service did not produce, which is what a proxy or a captive
 * portal returns, is reported as unavailable rather than as a Velvet error.
 */
function failure(payload: unknown): UpdateResult<never> {
  const error = record(record(payload)?.error);
  if (
    !error ||
    typeof error.code !== "string" ||
    typeof error.message !== "string" ||
    typeof error.errorId !== "string"
  ) {
    return { status: "unavailable" };
  }
  return {
    status: "error",
    code: error.code,
    message: error.message,
    errorId: error.errorId,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) return null;
  try {
    const text = await response.text();
    return text.length > MAX_RESPONSE_BYTES ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseInstallation(value: unknown): ManagedInstallation | null {
  const entry = record(value);
  if (
    !entry ||
    !Number.isSafeInteger(entry.installationId) ||
    !Number.isSafeInteger(entry.repositoryId) ||
    typeof entry.owner !== "string" ||
    typeof entry.name !== "string" ||
    typeof entry.htmlUrl !== "string" ||
    (entry.installedVersion !== null &&
      (typeof entry.installedVersion !== "string" ||
        !SEMANTIC_VERSION.test(entry.installedVersion)))
  ) {
    return null;
  }
  return {
    installationId: entry.installationId as number,
    repositoryId: entry.repositoryId as number,
    owner: entry.owner,
    name: entry.name,
    htmlUrl: entry.htmlUrl,
    installedVersion: entry.installedVersion as string | null,
  };
}

function parseDirectory(value: unknown): InstallationDirectory | null {
  const body = record(value);
  if (!body || !Array.isArray(body.repositories) || typeof body.truncated !== "boolean") {
    return null;
  }
  const repositories = body.repositories.map(parseInstallation);
  if (repositories.some((entry) => entry === null)) return null;
  return {
    repositories: repositories as ManagedInstallation[],
    truncated: body.truncated,
  };
}

function parseUpdate(value: unknown): InstallationUpdate | null {
  const body = record(value);
  if (!body) return null;
  const repository = parseInstallation({
    ...record(body.repository),
    installedVersion: body.installedVersion ?? null,
  });
  if (
    !repository ||
    typeof body.automaticSecurityUpdates !== "boolean" ||
    typeof body.availableVersion !== "string" ||
    !SEMANTIC_VERSION.test(body.availableVersion) ||
    typeof body.releaseType !== "string" ||
    !RELEASE_TYPES.includes(body.releaseType) ||
    typeof body.automaticInstallEligible !== "boolean" ||
    typeof body.releaseNotes !== "string"
  ) {
    return null;
  }
  return {
    repository,
    installedVersion: repository.installedVersion,
    automaticSecurityUpdates: body.automaticSecurityUpdates,
    availableVersion: body.availableVersion,
    releaseType: body.releaseType as InstallationUpdate["releaseType"],
    automaticInstallEligible: body.automaticInstallEligible,
    releaseNotes: body.releaseNotes,
  };
}

function parseOperation(value: unknown): UpdateOperation | null {
  const body = record(value);
  if (
    !body ||
    typeof body.operationId !== "string" ||
    typeof body.version !== "string" ||
    typeof body.state !== "string" ||
    !MANAGED_UPDATE_STATES.includes(body.state as ManagedUpdateState)
  ) {
    return null;
  }
  if (
    body.reason !== undefined &&
    (typeof body.reason !== "string" ||
      !MANAGED_UPDATE_REASONS.includes(body.reason as ManagedUpdateReason))
  ) {
    return null;
  }
  const pullRequest = record(body.pullRequest);
  return {
    operationId: body.operationId,
    version: body.version,
    state: body.state as ManagedUpdateState,
    ...(body.reason ? { reason: body.reason as ManagedUpdateReason } : {}),
    ...(pullRequest &&
    Number.isSafeInteger(pullRequest.number) &&
    typeof pullRequest.htmlUrl === "string"
      ? {
          pullRequest: {
            number: pullRequest.number as number,
            htmlUrl: pullRequest.htmlUrl,
          },
        }
      : {}),
  };
}
