import {
  SEMANTIC_VERSION_PATTERN,
  parseVelvetConfiguration,
  validateInstallationConfiguration,
  validateSetupInstallations,
} from "@velvet/contracts";

import { GitHubApiError } from "./github-api.js";
import { jsonResponse, readBoundedJson } from "./http.js";
import type { AuditLogger } from "./observability.js";
import type { SetupServerSession } from "./session.js";
import {
  createUpdateAccess,
  UpdateAccessError,
  type ManageableRepository,
  type UpdateAccess,
} from "./update-access.js";
import {
  ManagedUpdateError,
  managedUpdateErrorCode,
  managedUpdateErrorStatus,
  publicManagedUpdateError,
} from "./update-error.js";
import type {
  ManagedUpdateOrchestrator,
  ManagedUpdateReleaseProvider,
} from "./update-orchestrator-types.js";
import {
  setAutomaticSecurityUpdates,
  setGalleryListing,
} from "./update-preference.js";
import { isRecord, positiveInteger } from "./update-github-validation.js";

const SEMANTIC_VERSION = new RegExp(SEMANTIC_VERSION_PATTERN, "u");

/**
 * Whether a failure is GitHub saying the file is not there.
 *
 * Told apart from every other failure on purpose. A repository without a
 * `velvet.yml` is an answer, whilst a refusal, a rate limit or an outage is
 * not, and answering all of them the same way would report an installation as
 * unconfigured whenever GitHub was having a bad minute.
 *
 * @param cause - Whatever was thrown.
 * @returns True only for a 404.
 */
function missingFile(cause: unknown): boolean {
  return cause instanceof GitHubApiError && cause.status === 404;
}

const INSTALLATIONS_ROUTE = "/api/installations";
const CONFIGURATION_ROUTE = "/api/configuration";
const UPDATES_ROUTE = "/api/updates";
const AUTOMATIC_ROUTE = "/api/updates/automatic";
const GALLERY_ROUTE = "/api/updates/gallery";

/** Every route in this module, so the handler can tell them apart from setup. */
export const UPDATE_ROUTES: readonly string[] = [
  INSTALLATIONS_ROUTE,
  CONFIGURATION_ROUTE,
  UPDATES_ROUTE,
  AUTOMATIC_ROUTE,
  GALLERY_ROUTE,
];

/**
 * One request, already past authentication and the mutation boundary.
 *
 * The session is narrowed to an authenticated one, because none of these
 * routes has anything to say to an anonymous caller and no route should have
 * to re-establish that.
 */
export interface UpdateRouteRequest {
  route: string;
  url: URL;
  request: Request;
  session: SetupServerSession & { githubUserToken: string };
  requestId: string;
}

export interface UpdateRoutes {
  /**
   * Answers one managed-update request.
   *
   * @returns The response, or `null` when the route belongs to another part of
   *   the service.
   */
  handle(input: UpdateRouteRequest): Promise<Response | null>;
}

interface UpdateRoutesOptions {
  orchestrator: ManagedUpdateOrchestrator;
  releases: ManagedUpdateReleaseProvider;
  logger: AuditLogger;
  access?: UpdateAccess;
  errorId?: () => string;
}

/**
 * Builds the routes through which a signed-in user manages their installation.
 *
 * Authorization is not a property of these routes; it is delegated to
 * {@link UpdateAccess}, which decides from what GitHub reports for the user's
 * own token. That keeps one place responsible for the question of who may act
 * on which repository, however many routes end up asking it.
 */
export function createUpdateRoutes(
  options: UpdateRoutesOptions & { github: Parameters<typeof createUpdateAccess>[0]["github"] },
): UpdateRoutes {
  const access =
    options.access ?? createUpdateAccess({ github: options.github });
  const errorId =
    options.errorId ?? (() => crypto.randomUUID().replaceAll("-", ""));

  /**
   * Turns any failure into the public update shape and records it.
   *
   * The cause never reaches the caller. What does is a stable code, its fixed
   * message, and an identifier the user can quote into a support request.
   */
  const failure = (input: UpdateRouteRequest, cause: unknown): Response => {
    const error =
      cause instanceof ManagedUpdateError && cause.errorId !== ""
        ? cause
        : new ManagedUpdateError(managedUpdateErrorCode(cause), {
            errorId: errorId(),
            cause,
          });
    const status = managedUpdateErrorStatus(error.code);
    options.logger({
      level: status >= 500 ? "error" : "warn",
      requestId: input.requestId,
      route: input.route,
      operation: "update",
      status,
      outcome: status === 403 || status === 400 ? "rejected" : "failed",
      errorId: error.errorId,
      cause,
    });
    return jsonResponse({ error: publicManagedUpdateError(error) }, status);
  };

  /**
   * Reads a request body as an object, or refuses the request.
   *
   * A body that is absent, oversized, or not JSON is a malformed request
   * rather than an internal failure, so it is reported as one.
   */
  const requestBody = async (
    request: Request,
  ): Promise<Record<string, unknown>> => {
    let value: unknown;
    try {
      value = await readBoundedJson(request);
    } catch (cause) {
      throw new ManagedUpdateError("UPDATE_REQUEST_INVALID", {
        errorId: errorId(),
        cause,
      });
    }
    if (!isRecord(value)) {
      throw new ManagedUpdateError("UPDATE_REQUEST_INVALID", {
        errorId: errorId(),
      });
    }
    return value;
  };

  /**
   * Resolves the repository named by a request, refusing anything else.
   *
   * @throws {UpdateAccessError} When the identifiers are missing, malformed,
   *   or name something the user does not administer.
   */
  const target = async (
    input: UpdateRouteRequest,
    installationId: unknown,
    repositoryId: unknown,
  ): Promise<ManageableRepository> => {
    if (!positiveInteger(installationId) || !positiveInteger(repositoryId)) {
      throw new UpdateAccessError();
    }
    return access.authorize(
      input.session.githubUserToken,
      installationId,
      repositoryId,
    );
  };

  /**
   * How one installation is published today.
   *
   * A repository with no `velvet.yml` answers with no theme rather than with a
   * failure: somebody may have granted access to a repository they never set
   * Velvet up in, and there is nothing wrong with that. A file that is there
   * and does not parse is a different thing and is reported as such, the same
   * way the update route reports it.
   *
   * @param repository - The repository, already authorised for this user.
   * @param input - The request, for the token it carries.
   * @returns The theme and what has been set on it.
   */
  const installationConfiguration = async (
    repository: ManageableRepository,
    input: UpdateRouteRequest,
  ): Promise<{ theme: string | null; themeSettings: Record<string, unknown> }> => {
    let source: string;
    try {
      const configuration = await access.readConfiguration(
        input.session.githubUserToken,
        repository,
      );
      source = configuration.source;
    } catch (cause) {
      if (missingFile(cause)) return { theme: null, themeSettings: {} };
      throw cause;
    }
    const parsed = parseVelvetConfiguration(source);
    if (!parsed.success) {
      throw new ManagedUpdateError("UPDATE_INSTALLATION_INVALID", {
        errorId: errorId(),
      });
    }
    return {
      theme: parsed.data.statusPage.theme,
      themeSettings: parsed.data.statusPage.themeSettings ?? {},
    };
  };

  return {
    async handle(input) {
      if (!UPDATE_ROUTES.includes(input.route)) return null;
      const method = input.request.method;

      try {
        if (input.route === INSTALLATIONS_ROUTE) {
          if (method !== "GET") return null;
          const listed = await access.list(input.session.githubUserToken);
          const body = {
            repositories: listed.repositories.map(publicInstallation),
            truncated: listed.truncated,
          };
          // Held against the contract before it leaves, because the
          // configurator refuses a listing that does not match it and would
          // otherwise report that as its own failure.
          if (!validateSetupInstallations(body).success) {
            throw new ManagedUpdateError("UPDATE_FAILED", {
              errorId: errorId(),
            });
          }
          return jsonResponse(body);
        }

        if (input.route === CONFIGURATION_ROUTE) {
          if (method !== "GET") return null;
          const repository = await target(
            input,
            numeric(input.url.searchParams.get("installation")),
            numeric(input.url.searchParams.get("repository")),
          );
          const body = await installationConfiguration(repository, input);
          // Held against the contract before it leaves, for the same reason
          // the listing above is: the configurator refuses an answer it cannot
          // read and would otherwise report that as its own failure.
          if (!validateInstallationConfiguration(body).success) {
            throw new ManagedUpdateError("UPDATE_FAILED", {
              errorId: errorId(),
            });
          }
          return jsonResponse(body);
        }

        if (input.route === UPDATES_ROUTE && method === "GET") {
          const repository = await target(
            input,
            numeric(input.url.searchParams.get("installation")),
            numeric(input.url.searchParams.get("repository")),
          );
          const version = options.releases.latest();
          const release = await options.releases.get(version);
          const configuration = await access.readConfiguration(
            input.session.githubUserToken,
            repository,
          );
          const parsed = parseVelvetConfiguration(configuration.source);
          if (!parsed.success) {
            throw new ManagedUpdateError("UPDATE_INSTALLATION_INVALID", {
              errorId: "",
            });
          }
          return jsonResponse({
            repository: publicRepository(repository),
            installedVersion: repository.installedVersion,
            automaticSecurityUpdates:
              parsed.data.updates.automaticSecurityUpdates,
            listedAsReference: parsed.data.gallery.listed,
            availableVersion: version,
            releaseType: release.manifest.releaseType,
            automaticInstallEligible: release.manifest.automaticInstallEligible,
            releaseNotes: release.manifest.releaseNotes,
          });
        }

        if (input.route === UPDATES_ROUTE && method === "POST") {
          const body = await requestBody(input.request);
          const repository = await target(
            input,
            body.installationId,
            body.repositoryId,
          );
          const version =
            typeof body.version === "string" ? body.version : "";
          if (!SEMANTIC_VERSION.test(version)) {
            throw new ManagedUpdateError("UPDATE_REQUEST_INVALID", {
              errorId: errorId(),
            });
          }
          const result = await options.orchestrator.reconcile({
            installationId: repository.installationId,
            repositoryId: repository.repositoryId,
            version,
            trigger: "manual",
          });
          return jsonResponse(result);
        }

        if (input.route === AUTOMATIC_ROUTE && method === "POST") {
          const body = await requestBody(input.request);
          if (typeof body.enabled !== "boolean") {
            throw new ManagedUpdateError("UPDATE_REQUEST_INVALID", {
              errorId: errorId(),
            });
          }
          const repository = await target(
            input,
            body.installationId,
            body.repositoryId,
          );
          const enabled = body.enabled;
          const current = await access.readConfiguration(
            input.session.githubUserToken,
            repository,
          );
          const edited = setAutomaticSecurityUpdates(current.source, enabled);
          if (edited === null) {
            throw new ManagedUpdateError("UPDATE_INSTALLATION_INVALID", {
              errorId: errorId(),
            });
          }
          if (edited !== current.source) {
            await access.writeConfiguration(
              input.session.githubUserToken,
              repository,
              edited,
              current.blobSha,
            );
          }
          return jsonResponse({ automaticSecurityUpdates: enabled });
        }

        if (input.route === GALLERY_ROUTE && method === "POST") {
          const body = await requestBody(input.request);
          if (typeof body.listed !== "boolean") {
            throw new ManagedUpdateError("UPDATE_REQUEST_INVALID", {
              errorId: errorId(),
            });
          }
          const repository = await target(
            input,
            body.installationId,
            body.repositoryId,
          );
          const listed = body.listed;
          const current = await access.readConfiguration(
            input.session.githubUserToken,
            repository,
          );
          const edited = setGalleryListing(current.source, listed);
          if (edited === null) {
            throw new ManagedUpdateError("UPDATE_INSTALLATION_INVALID", {
              errorId: errorId(),
            });
          }
          if (edited !== current.source) {
            await access.writeConfiguration(
              input.session.githubUserToken,
              repository,
              edited,
              current.blobSha,
            );
          }
          return jsonResponse({ listedAsReference: listed });
        }

        return null;
      } catch (cause) {
        return failure(input, cause);
      }
    },
  };
}

/** The repository fields an interface may see. */
function publicRepository(
  repository: ManageableRepository,
): Record<string, unknown> {
  return {
    installationId: repository.installationId,
    repositoryId: repository.repositoryId,
    owner: repository.owner,
    name: repository.name,
    htmlUrl: repository.htmlUrl,
  };
}

/**
 * One entry of the installation listing, in the shape the contract states.
 *
 * Built from {@link publicRepository} rather than beside it, so the fields a
 * repository shows the browser are decided once. What this adds is the
 * installed version, which the listing carries per entry whilst the update
 * route reports it on its own.
 *
 * `defaultBranch` is deliberately not here. It is how the service reads and
 * writes a repository's files, and nothing in the browser addresses a branch.
 */
function publicInstallation(
  repository: ManageableRepository,
): Record<string, unknown> {
  return {
    ...publicRepository(repository),
    installedVersion: repository.installedVersion,
  };
}

function numeric(value: string | null): number | null {
  if (!value || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
