import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import {
  validateNotifyRequest,
  validateSetupEvent,
  validateSetupRequest,
  validateSetupSession,
  validateSetupStatus,
  type SetupEvent,
  type SetupRequest,
} from "@velvet/contracts";

import { DEPLOYMENT_FINGERPRINT } from "./deployment-fingerprint.generated.js";
import {
  createGitHubAuthorizationUrl,
  createGitHubBootstrapInstallationUrl,
  createGitHubInstallationUrl,
  createPkceAuthorization,
} from "./auth.js";
import type { SetupServiceConfig } from "./config.js";
import {
  GitHubApiError,
  type GitHubInstallation,
  type GitHubSetupClient,
} from "./github.js";
import type { AuditLogger } from "./observability.js";
import { createNotifyRelay, type NotifyRelay } from "./notify.js";
import { createNotificationGrants } from "./notify-grant.js";
import { createGitHubOidcVerifier } from "./oidc.js";
import type { InstallationSerialCounter } from "./serial.js";
import { provisionVelvet } from "./provision.js";
import { createRateLimiter, type RateLimiter } from "./rate-limit.js";
import {
  clearSessionCookie,
  createSessionCookie,
  parseSessionCookie,
  type SessionStore,
  type SetupServerSession,
} from "./session.js";
import { publicSetupError, SetupServiceError } from "./setup-error.js";
import { embeddedVelvetReleases } from "./update-releases.js";
import {
  jsonResponse,
  readBoundedJson,
  RequestTooLargeError,
} from "./http.js";
import { createUpdateServices } from "./update-service.js";
import { UPDATE_ROUTES, type UpdateRoutes } from "./update-routes.js";
import type { ManagedUpdateReleaseProvider } from "./update-orchestrator-types.js";

const SESSION_MAX_AGE_SECONDS = 30 * 60;

type ProvisionFunction = typeof provisionVelvet;
type StaticAssetProvider = (path: string) => Promise<Response | null>;

interface SetupHandlerOptions {
  config: SetupServiceConfig;
  sessions: SessionStore;
  github: GitHubSetupClient;
  logger: AuditLogger;
  provision?: ProvisionFunction;
  /**
   * Issues installation serials, when the instance has a registry configured.
   *
   * Absent on an instance without one, in which case `/api/serial` reports no
   * number and setups complete exactly as before.
   */
  serials?: InstallationSerialCounter;
  releases?: ManagedUpdateReleaseProvider;
  updates?: UpdateRoutes;
  staticAsset?: StaticAssetProvider;
  setupRateLimiter?: RateLimiter;
  authRateLimiter?: RateLimiter;
  /**
   * Forwards alarms to Pushover, when the instance is configured to.
   *
   * Absent on an instance with no relay configured, and `/api/notify` then
   * refuses with a code saying exactly that rather than a generic failure.
   */
  notify?: NotifyRelay;
  /** Bounds the work an unproven caller can ask of `/api/notify`. */
  notifyRateLimiter?: RateLimiter;
  randomToken?: () => string;
  requestId?: () => string;
  errorId?: () => string;
}

export function createSetupHandler(
  options: SetupHandlerOptions,
): (request: Request) => Promise<Response> {
  const provision = options.provision ?? provisionVelvet;
  const releases = options.releases ?? embeddedVelvetReleases();
  const updates = options.updates ?? defaultUpdateRoutes(options, releases);
  const setupRateLimiter =
    options.setupRateLimiter ??
    createRateLimiter({ limit: 10, windowMs: 60_000, maxEntries: 2_000 });
  const authRateLimiter =
    options.authRateLimiter ??
    createRateLimiter({ limit: 30, windowMs: 60_000, maxEntries: 2_000 });
  const notify = options.notify ?? defaultNotifyRelay(options.config);
  /*
   * A ceiling on the work an unproven caller can ask for, since this route is
   * the one thing here that no session guards: it is called by a GitHub Actions
   * runner, not by a browser.
   *
   * It counts every call rather than counting per source, because the only
   * thing naming a source on this deployment is a forwarded header, and a
   * forwarded header is chosen by whoever sends it. The ceiling is therefore
   * set well above what every installation together would ever send, so it
   * bounds the cost of a flood without a legitimate alarm ever meeting it. What
   * limits an individual installation is its own allowance, counted after
   * GitHub has proved which one it is.
   */
  const notifyRateLimiter =
    options.notifyRateLimiter ??
    createRateLimiter({ limit: 600, windowMs: 60_000, maxEntries: 1 });
  const randomToken = options.randomToken ?? secureRandomToken;
  const requestId = options.requestId ?? secureIdentifier;
  const errorId = options.errorId ?? secureIdentifier;

  return async (request) => {
    const currentRequestId = requestId();
    const url = new URL(request.url);
    const route = url.pathname;
    const cookieValue = parseSessionCookie(request.headers.get("Cookie"));
    const session = options.sessions.fromCookie(cookieValue);

    const finish = (response: Response): Response =>
      secureResponse(response, currentRequestId, {
        secure: options.config.secureCookies,
      });
    const reject = (
      error: SetupServiceError,
      operation: string,
      extraHeaders?: HeadersInit,
    ): Response => {
      const currentErrorId = errorId();
      options.logger({
        level: error.status >= 500 ? "error" : "warn",
        requestId: currentRequestId,
        route,
        operation,
        status: error.status,
        outcome: "rejected",
        code: error.code,
        errorId: currentErrorId,
        cause: error.cause,
      });
      return finish(
        jsonResponse(
          { error: publicSetupError(error, currentErrorId) },
          error.status,
          extraHeaders,
        ),
      );
    };

    try {
      if (route === "/healthz") {
        if (request.method !== "GET") return reject(methodError(), "health");
        /*
         * The fingerprint identifies the sources this build was made from, so
         * a check can tell whether what is deployed is what `main` holds. The
         * website deploys itself on merge whilst this service is deployed by
         * hand, and without this the gap between them is invisible: a fix to a
         * shared component reached the website within minutes and the
         * onboarding days later, with nothing reporting the difference.
         *
         * It is a hash of source paths and contents, so it reveals nothing
         * about the sources themselves.
         */
        return finish(
          jsonResponse({ status: "ok", fingerprint: DEPLOYMENT_FINGERPRINT }),
        );
      }

      if (route === "/api/serial") {
        if (request.method !== "GET") return reject(methodError(), "serial");
        // Public and unauthenticated, because it reveals only how many
        // installations exist, which the number printed on the page shows
        // anyway. It is provisional: nothing is reserved, and two visitors at
        // once are told the same number.
        const next = (await options.serials?.peek()) ?? null;
        return finish(jsonResponse({ next }));
      }

      if (route === "/api/references") {
        if (request.method !== "GET") return reject(methodError(), "references");
        /*
         * Public and unauthenticated, and deliberately narrow: the page name
         * and its address, both of which are already published by the status
         * page itself. The repository and the account behind it stay in the
         * private registry, because a GitHub account names a person.
         *
         * An entry appears only whilst that installation's own `velvet.yml`
         * says so. `null` means the registry could not be read, which the page
         * shows as nothing rather than as an empty gallery.
         */
        const entries = (await options.serials?.listed()) ?? null;
        return finish(
          jsonResponse({ entries }, 200, {
            // Short enough that a withdrawal disappears promptly, long enough
            // that the page does not read the registry on every visit.
            "Cache-Control": "public, max-age=300",
            /*
             * The one route this service answers to another origin, because it
             * is the one written to be read by a page that is not ours to
             * serve. The website is static on GitHub Pages and the registry is
             * private, so without this the page shows an empty list however
             * many installations have consented.
             *
             * A single origin is named rather than `*`, and only when one is
             * configured. `secureResponse` reads this header back and relaxes
             * the resource policy to match, so the exception is stated once,
             * here, on the route it belongs to.
             *
             * `Vary` because the answer now depends on who asked, and a cache
             * that missed that would serve this body to somebody else.
             */
            ...(options.config.websiteOrigin
              ? {
                  "Access-Control-Allow-Origin": options.config.websiteOrigin,
                  Vary: "Origin",
                }
              : {}),
          }),
        );
      }

      if (route === "/api/session") {
        if (request.method !== "GET") return reject(methodError(), "session");
        const activeSession = session ?? options.sessions.create();
        const body = publicSession(activeSession);
        if (!validateSetupSession(body).success) {
          return reject(internalContractError(), "session");
        }
        return finish(
          jsonResponse(body, 200, {
            "Set-Cookie": createSessionCookie(
              options.sessions.cookieValue(activeSession.id),
              options.config.secureCookies,
              SESSION_MAX_AGE_SECONDS,
            ),
          }),
        );
      }

      if (route === "/api/auth/start") {
        if (request.method !== "GET") return reject(methodError(), "oauth-start");
        const activeSession = session ?? options.sessions.create();
        const limit = authRateLimiter.consume(activeSession.id);
        if (!limit.allowed) {
          return reject(rateLimitError(), "oauth-start", {
            "Retry-After": String(limit.retryAfterSeconds),
          });
        }
        const authorization = createPkceAuthorization(randomToken);
        // Matched against the two tools rather than used as an address. A
        // redirect target taken from a request is a redirect somebody else
        // chose, so an unknown value falls back to the onboarding.
        const asked = url.searchParams.get("return");
        activeSession.oauth = {
          state: authorization.state,
          codeVerifier: authorization.codeVerifier,
          returnTo: asked === "configurator" ? "configurator" : "onboarding",
        };
        const location = createGitHubAuthorizationUrl({
          clientId: options.config.github.clientId,
          state: authorization.state,
          codeChallenge: authorization.codeChallenge,
        });
        return finish(
          redirectResponse(location, {
            "Set-Cookie": createSessionCookie(
              options.sessions.cookieValue(activeSession.id),
              options.config.secureCookies,
              SESSION_MAX_AGE_SECONDS,
            ),
          }),
        );
      }

      if (route === "/api/auth/callback") {
        if (request.method !== "GET") return reject(methodError(), "oauth-callback");
        if (!session?.oauth) {
          return reject(authenticationFailed(), "oauth-callback");
        }
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (
          !state ||
          !code ||
          code.length > 512 ||
          !safeEqual(state, session.oauth.state)
        ) {
          return reject(authenticationFailed(), "oauth-callback");
        }
        const codeVerifier = session.oauth.codeVerifier;
        const returnTo = session.oauth.returnTo ?? "onboarding";
        delete session.oauth;
        let userToken: string | undefined;
        try {
          userToken = await options.github.exchangeOAuthCode(code, codeVerifier);
          const viewer = await options.github.viewer(userToken);
          const authenticatedSession = options.sessions.rotate(session.id);
          authenticatedSession.githubUserToken = userToken;
          authenticatedSession.user = viewer;
          return finish(
            redirectResponse(`${options.config.publicOrigin}/${returnTo}/?github=connected`, {
              "Set-Cookie": createSessionCookie(
                options.sessions.cookieValue(authenticatedSession.id),
                options.config.secureCookies,
                SESSION_MAX_AGE_SECONDS,
              ),
            }),
          );
        } catch (cause) {
          if (userToken) {
            try {
              await options.github.revokeUserToken(userToken);
            } catch (revokeCause) {
              options.logger({
                level: "warn",
                requestId: currentRequestId,
                route,
                operation: "oauth-cleanup",
                status: 502,
                outcome: "fallback",
                code: "AUTHENTICATION_FAILED",
                cause: revokeCause,
              });
            }
          }
          options.sessions.destroy(session.id);
          return reject(
            new SetupServiceError(
              "AUTHENTICATION_FAILED",
              "GitHub authentication could not be completed. Start again.",
              { status: 400, recoverable: true, cause },
            ),
            "oauth-callback",
            {
              "Set-Cookie": clearSessionCookie(options.config.secureCookies),
            },
          );
        }
      }

      if (route === "/api/auth/installed") {
        if (request.method !== "GET") return reject(methodError(), "installation-callback");
        if (!authenticated(session) || !session.installState) {
          return reject(authenticationRequired(), "installation-callback");
        }
        const state = url.searchParams.get("state");
        if (!state || !safeEqual(state, session.installState)) {
          return reject(authenticationFailed(), "installation-callback");
        }
        delete session.installState;
        if (url.searchParams.get("setup_action") === "request") {
          session.organizationApprovalPending = true;
          return finish(
            redirectResponse(
              `${options.config.publicOrigin}/onboarding/?github=approval-required`,
            ),
          );
        }
        const installationId = positiveInteger(url.searchParams.get("installation_id"));
        if (!installationId) {
          return reject(authenticationFailed(), "installation-callback");
        }
        try {
          const installations = await options.github.listInstallations(
            session.githubUserToken,
          );
          const installation = installations.find(
            (candidate) => candidate.id === installationId,
          );
          if (!installation) {
            return reject(
              new SetupServiceError(
                "INSTALLATION_REQUIRED",
                "GitHub has not granted this installation to Velvet.",
                { status: 403, recoverable: true },
              ),
              "installation-callback",
            );
          }
          session.installation = installation;
          session.organizationApprovalPending = false;
          return finish(
            redirectResponse(
              `${options.config.publicOrigin}/onboarding/?github=installed`,
            ),
          );
        } catch (cause) {
          return reject(boundaryGitHubError(cause), "installation-callback");
        }
      }

      if (route === "/api/setup") {
        if (request.method !== "POST") return reject(methodError(), "provision");
        const mutationError = mutationBoundaryError(request, session, options.config);
        if (mutationError) return reject(mutationError, "provision");
        const activeSession = session!;
        const limit = setupRateLimiter.consume(activeSession.id);
        if (!limit.allowed) {
          return reject(rateLimitError(), "provision", {
            "Retry-After": String(limit.retryAfterSeconds),
          });
        }
        if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
          return reject(invalidRequestError(), "provision");
        }
        let value: unknown;
        try {
          value = await readBoundedJson(request);
        } catch (cause) {
          const tooLarge = cause instanceof RequestTooLargeError;
          return reject(
            new SetupServiceError(
              "INVALID_SETUP_REQUEST",
              tooLarge
                ? "Setup request is too large."
                : "Setup request must contain valid JSON.",
              { status: tooLarge ? 413 : 400, cause },
            ),
            "provision",
          );
        }
        const parsed = validateSetupRequest(value);
        if (!parsed.success) return reject(invalidRequestError(), "provision");
        return finish(
          setupStreamResponse({
            request: parsed.data,
            session: activeSession,
            github: options.github,
            appSlug: options.config.github.appSlug,
            randomToken,
            provision,
            ...(options.serials ? { serials: options.serials } : {}),
            logger: options.logger,
            requestId: currentRequestId,
            errorId,
          }),
        );
      }

      if (route === "/api/notify") {
        if (request.method !== "POST") return reject(methodError(), "notify");
        if (!notify) {
          return reject(
            new SetupServiceError(
              "NOTIFY_UNAVAILABLE",
              "This Velvet service forwards no alarms.",
              { status: 503 },
            ),
            "notify",
          );
        }
        const ceiling = notifyRateLimiter.consume("notify");
        if (!ceiling.allowed) {
          return reject(rateLimitError(), "notify", {
            "Retry-After": String(ceiling.retryAfterSeconds),
          });
        }
        /*
         * No session, no CSRF token, and no origin check, because none of the
         * three exists here: the caller is a workflow run rather than a
         * browser. What takes their place is the bearer token GitHub minted for
         * that run, which the relay verifies against GitHub's own keys.
         */
        const identityToken = bearerToken(request.headers.get("Authorization"));
        if (!identityToken) {
          return reject(
            new SetupServiceError(
              "NOTIFY_IDENTITY_REJECTED",
              "This alarm carried no proof of which repository sent it.",
              { status: 401 },
            ),
            "notify",
          );
        }
        if (
          !request.headers
            .get("Content-Type")
            ?.toLowerCase()
            .startsWith("application/json")
        ) {
          return reject(invalidRequestError(), "notify");
        }
        let body: unknown;
        try {
          body = await readBoundedJson(request);
        } catch (cause) {
          const tooLarge = cause instanceof RequestTooLargeError;
          return reject(
            new SetupServiceError(
              "INVALID_SETUP_REQUEST",
              tooLarge
                ? "Alarm request is too large."
                : "Alarm request must contain valid JSON.",
              { status: tooLarge ? 413 : 400, cause },
            ),
            "notify",
          );
        }
        const parsedNotify = validateNotifyRequest(body);
        if (!parsedNotify.success) return reject(invalidRequestError(), "notify");

        const result = await notify.relay({
          identityToken,
          request: parsedNotify.data,
        });
        if (result.outcome === "refused") {
          const currentErrorId = errorId();
          /*
           * Logged here rather than through `reject`, because what makes one of
           * these diagnosable is which repository called and what Pushover said
           * was left, and neither belongs to a generic refusal. The recipient's
           * key, the grant carrying it, and the alarm text are all secret and
           * none of them is in the context.
           */
          options.logger({
            level: result.error.status >= 500 ? "error" : "warn",
            requestId: currentRequestId,
            route,
            operation: "notify",
            status: result.error.status,
            outcome: "rejected",
            code: result.error.code,
            errorId: currentErrorId,
            context: result.context,
            cause: result.error.cause,
          });
          return finish(
            jsonResponse(
              { error: publicSetupError(result.error, currentErrorId) },
              result.error.status,
              result.retryAfterSeconds === undefined
                ? undefined
                : { "Retry-After": String(result.retryAfterSeconds) },
            ),
          );
        }
        options.logger({
          level: "info",
          requestId: currentRequestId,
          route,
          operation: "notify",
          status: 202,
          outcome: "succeeded",
          context: result.context,
        });
        // Accepted rather than created: Pushover took the message, and whether
        // it reaches a device is between Pushover and that device.
        return finish(jsonResponse({ delivered: true }, 202));
      }

      if (route === "/api/setup/status") {
        if (request.method !== "GET") return reject(methodError(), "setup-status");
        if (!authenticated(session)) {
          return reject(authenticationRequired(), "setup-status");
        }
        if (!session.operation) {
          return reject(
            new SetupServiceError(
              "NOT_FOUND",
              "No setup operation exists in this session.",
              { status: 404 },
            ),
            "setup-status",
          );
        }
        if (!validateSetupStatus(session.operation).success) {
          return reject(internalContractError(), "setup-status");
        }
        return finish(jsonResponse(session.operation));
      }

      if (UPDATE_ROUTES.includes(route)) {
        // Authenticated throughout, because everything here concerns one
        // person's installation rather than public information about Velvet.
        if (!authenticated(session)) {
          return reject(authenticationRequired(), "updates");
        }
        if (request.method !== "GET") {
          const mutationError = mutationBoundaryError(
            request,
            session,
            options.config,
          );
          if (mutationError) return reject(mutationError, "updates");
        }
        const response = await updates.handle({
          route,
          url,
          request,
          session,
          requestId: currentRequestId,
        });
        return response
          ? finish(response)
          : reject(methodError(), "updates");
      }

      if (route === "/api/logout") {
        if (request.method !== "POST") return reject(methodError(), "logout");
        const mutationError = mutationBoundaryError(request, session, options.config);
        if (mutationError) return reject(mutationError, "logout");
        const activeSession = session!;
        if (activeSession.githubUserToken) {
          try {
            await options.github.revokeUserToken(activeSession.githubUserToken);
          } catch (cause) {
            options.logger({
              level: "warn",
              requestId: currentRequestId,
              route,
              operation: "logout-revoke",
              status: 502,
              outcome: "fallback",
              code: "GITHUB_API_FAILED",
              cause,
            });
          }
        }
        options.sessions.destroy(activeSession.id);
        return finish(
          new Response(null, {
            status: 204,
            headers: {
              "Cache-Control": "no-store",
              "Set-Cookie": clearSessionCookie(options.config.secureCookies),
            },
          }),
        );
      }

      if (request.method === "GET" && route === "/") {
        return finish(redirectResponse(`${options.config.publicOrigin}/onboarding/`));
      }
      if (
        request.method === "GET" &&
        (route === "/onboarding" || route === "/configurator")
      ) {
        return finish(
          redirectResponse(`${options.config.publicOrigin}${route}/`),
        );
      }
      if (request.method === "GET" && options.staticAsset) {
        const assetPath = allowlistedAssetPath(route);
        if (assetPath) {
          const asset = await options.staticAsset(assetPath);
          if (asset) return finish(asset);
        }
      }

      return reject(
        new SetupServiceError("NOT_FOUND", "The requested resource was not found.", {
          status: 404,
        }),
        "route",
      );
    } catch (cause) {
      return reject(
        new SetupServiceError(
          "SETUP_FAILED",
          "The setup service could not complete this request.",
          { status: 500, recoverable: true, cause },
        ),
        "request",
      );
    }
  };
}

function setupStreamResponse(input: {
  request: SetupRequest;
  session: SetupServerSession;
  github: GitHubSetupClient;
  appSlug: string;
  randomToken: () => string;
  provision: ProvisionFunction;
  serials?: InstallationSerialCounter;
  logger: AuditLogger;
  requestId: string;
  errorId: () => string;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let responseClosed = false;
      const emit = (event: SetupEvent): void => {
        if (!validateSetupEvent(event).success) {
          throw internalContractError();
        }
        if (responseClosed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          if (
            event.type === "progress" &&
            event.stage === "starting-monitor"
          ) {
            controller.close();
            responseClosed = true;
          }
        } catch {
          // Provisioning continues when the browser disconnects; session status remains queryable.
        }
      };
      void (async () => {
        const currentErrorId = input.errorId();
        try {
          const installations = await input.github.listInstallations(
            input.session.githubUserToken!,
          );
          const owner = input.request.configuration.repository.owner;
          const installation = installationForOwner(installations, owner);
          if (installation) {
            input.session.installation = installation;
            input.session.organizationApprovalPending = false;
          } else {
            delete input.session.installation;
          }
          try {
            await input.provision({
              session: input.session,
              request: input.request,
              github: input.github,
              onEvent: emit,
              ...(input.serials ? { serials: input.serials } : {}),
              errorId: () => currentErrorId,
            });
          } catch (cause) {
            const repository = input.session.provisioning?.repository;
            if (
              cause instanceof SetupServiceError &&
              cause.code === "INSTALLATION_REQUIRED"
            ) {
              const target = repository ?? input.session.provisioning?.target;
              if (!target) throw cause;
              const state = input.randomToken();
              input.session.installState = state;
              const approvalPending =
                input.session.organizationApprovalPending === true;
              const error = approvalPending
                ? new SetupServiceError(
                    "ORGANIZATION_APPROVAL_REQUIRED",
                    "A GitHub organization owner still needs to approve the Velvet installation.",
                    { status: 403, recoverable: true },
                  )
                : cause;
              const publicError = publicSetupError(error, currentErrorId);
              if (input.session.operation) {
                input.session.operation = {
                  ...input.session.operation,
                  state: "permission-required",
                  ...(repository ? { repositoryUrl: repository.htmlUrl } : {}),
                  error: publicError,
                };
              }
              const access = repository ? "repository" : "temporary-account";
              emit({
                type: "permission-required",
                access,
                error: publicError,
                installationUrl: repository
                  ? createGitHubInstallationUrl(
                      input.appSlug,
                      state,
                      repository.ownerId,
                      repository.id,
                    )
                  : createGitHubBootstrapInstallationUrl(
                      input.appSlug,
                      state,
                      target.id,
                    ),
              });
              input.logger({
                level: "warn",
                requestId: input.requestId,
                route: "/api/setup",
                operation: "installation-access",
                status: 403,
                outcome: "rejected",
                code: error.code,
                errorId: currentErrorId,
              });
              return;
            }
            throw cause;
          }
          input.logger({
            level: "info",
            requestId: input.requestId,
            route: "/api/setup",
            operation: "provision",
            status: 200,
            outcome: "succeeded",
          });
        } catch (cause) {
          const error = boundarySetupError(cause);
          const operation = input.session.operation;
          emit({
            type: "error",
            error: publicSetupError(error, currentErrorId),
            recoverable: error.recoverable,
            ...(operation?.repositoryUrl
              ? { repositoryUrl: operation.repositoryUrl }
              : {}),
            ...(operation?.workflowRunId
              ? { workflowRunId: operation.workflowRunId }
              : {}),
          });
          input.logger({
            level: "error",
            requestId: input.requestId,
            route: "/api/setup",
            operation: "provision",
            status: error.status,
            outcome: "failed",
            code: error.code,
            errorId: currentErrorId,
            cause,
          });
        } finally {
          if (!responseClosed) {
            try {
              controller.close();
            } catch {
              // The browser may have closed the stream after receiving a final event.
            }
          }
        }
      })();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}

function publicSession(session: SetupServerSession): Record<string, unknown> {
  const authenticatedSession = authenticated(session);
  return {
    authenticated: authenticatedSession,
    csrfToken: session.csrfToken,
    ...(authenticatedSession && session.user ? { user: session.user } : {}),
    ...(authenticatedSession && session.installation
      ? { installation: session.installation }
      : {}),
  };
}

function mutationBoundaryError(
  request: Request,
  session: SetupServerSession | null,
  config: SetupServiceConfig,
): SetupServiceError | null {
  if (
    request.headers.get("Origin") !== config.publicOrigin ||
    !sameOriginFetch(request.headers.get("Sec-Fetch-Site"))
  ) {
    return new SetupServiceError(
      "ORIGIN_REJECTED",
      "This request did not come from the Velvet setup page.",
      { status: 403 },
    );
  }
  if (!authenticated(session)) return authenticationRequired();
  const csrf = request.headers.get("X-Velvet-CSRF");
  if (!csrf || !safeEqual(csrf, session.csrfToken)) {
    return new SetupServiceError(
      "CSRF_REJECTED",
      "The setup session could not verify this request. Reload and try again.",
      { status: 403, recoverable: true },
    );
  }
  return null;
}

function authenticated(
  session: SetupServerSession | null,
): session is SetupServerSession & { githubUserToken: string } {
  return Boolean(session?.githubUserToken && session.user);
}

function installationForOwner(
  installations: GitHubInstallation[],
  owner: string,
): GitHubInstallation | undefined {
  return installations.find(
    (installation) => installation.accountLogin.toLowerCase() === owner.toLowerCase(),
  );
}

/**
 * Builds the managed-update routes when a caller did not supply them.
 *
 * A deployment cannot start with the update surface missing, which would
 * present as installations that never see an update rather than as a failure.
 * The service entry point supplies its own, so that the routes and the
 * scheduled security sweep share one orchestrator and therefore one queue per
 * repository.
 */
function defaultUpdateRoutes(
  options: SetupHandlerOptions,
  releases: ManagedUpdateReleaseProvider,
): UpdateRoutes {
  return createUpdateServices({
    config: options.config,
    github: options.github,
    releases,
    logger: options.logger,
  }).routes;
}

/**
 * Builds the alarm relay from configuration, or reports that there is none.
 *
 * The audience the identity proof has to name is this service's own origin, so
 * a token a workflow minted for somebody else's service does not verify here.
 * Without that requirement, any repository's default token would.
 *
 * @param config - The service's configuration.
 * @returns The relay, or `null` on an instance that forwards no alarms.
 */
function defaultNotifyRelay(config: SetupServiceConfig): NotifyRelay | null {
  if (!config.notify) return null;
  return createNotifyRelay({
    applicationToken: config.notify.pushoverToken,
    identity: createGitHubOidcVerifier({ audience: config.publicOrigin }),
    grants: createNotificationGrants({ secret: config.notify.grantSecret }),
    allowance: createRateLimiter({
      limit: config.notify.dailyLimit,
      windowMs: 24 * 60 * 60_000,
      maxEntries: 5_000,
    }),
    quotaFloor: config.notify.quotaFloor,
  });
}

/**
 * Reads a bearer token out of an `Authorization` header.
 *
 * @param header - The header exactly as it arrived, or `null`.
 * @returns The token, or `null` when the header is missing or another scheme.
 */
function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer ([A-Za-z0-9._~+/=-]{16,4096})$/u);
  return match ? match[1]! : null;
}

/**
 * Maps a request path onto a hosted application's file, or refuses it.
 *
 * Only a document root and hashed asset names resolve, so no request can
 * address anything else the service happens to have on disk.
 *
 * @returns The path below the public root, or `null` when nothing matches.
 */
function allowlistedAssetPath(pathname: string): string | null {
  const match = pathname.match(
    /^\/(onboarding|configurator)\/(assets\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/u,
  );
  if (!match) return null;
  return `${match[1]}/${match[2] ?? "index.html"}`;
}

function redirectResponse(location: string, headers?: HeadersInit): Response {
  return new Response(null, {
    status: 302,
    headers: { "Cache-Control": "no-store", Location: location, ...headers },
  });
}

function secureResponse(
  response: Response,
  requestId: string,
  policy: { secure: boolean },
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", requestId);
  headers.set(
    "Content-Security-Policy",
    // Two further deliberate grants beyond the default.
    //
    // `connect-src` names GitHub Pages because the Configurator reads the
    // community theme registry Velvet publishes there, and validates it before
    // using it.
    //
    // `style-src-attr` allows style attributes, which is how a themed preview
    // carries per-element custom properties. Stylesheets and `<style>`
    // elements stay restricted to this origin through `style-src`, so this
    // grants declarations on elements the application already renders and
    // nothing that could introduce a stylesheet.
    `default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' https://avatars.githubusercontent.com data:; font-src 'self'; connect-src 'self' https://phranck.github.io; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  /*
   * The resource policy follows the route's own decision rather than being
   * decided twice. A route that named an origin in `Access-Control-Allow-Origin`
   * has already said it may be read from elsewhere, and `same-origin` here would
   * refuse that read a second time, with an error indistinguishable from the
   * first and a cause in a different file.
   */
  headers.set(
    "Cross-Origin-Resource-Policy",
    headers.has("Access-Control-Allow-Origin") ? "cross-origin" : "same-origin",
  );
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  if (policy.secure) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function boundarySetupError(cause: unknown): SetupServiceError {
  if (cause instanceof SetupServiceError) return cause;
  return boundaryGitHubError(cause);
}

function boundaryGitHubError(cause: unknown): SetupServiceError {
  if (
    cause instanceof GitHubApiError &&
    (cause.status === 429 ||
      (cause.status === 403 && cause.retryAfterSeconds !== null))
  ) {
    return new SetupServiceError(
      "GITHUB_RATE_LIMITED",
      "GitHub temporarily limited setup requests. Try again later.",
      { status: 503, recoverable: true, cause },
    );
  }
  return new SetupServiceError(
    "GITHUB_API_FAILED",
    "GitHub could not complete this setup request.",
    { status: 502, recoverable: true, cause },
  );
}

function authenticationRequired(): SetupServiceError {
  return new SetupServiceError(
    "AUTHENTICATION_REQUIRED",
    "Connect your GitHub account before continuing.",
    { status: 401, recoverable: true },
  );
}

function authenticationFailed(): SetupServiceError {
  return new SetupServiceError(
    "AUTHENTICATION_FAILED",
    "GitHub authentication could not be verified. Start again.",
    { status: 400, recoverable: true },
  );
}

function invalidRequestError(): SetupServiceError {
  return new SetupServiceError(
    "INVALID_SETUP_REQUEST",
    "Setup request does not match the supported contract.",
    { status: 400 },
  );
}

function rateLimitError(): SetupServiceError {
  return new SetupServiceError(
    "RATE_LIMITED",
    "Too many setup requests. Try again later.",
    { status: 429, recoverable: true },
  );
}

function methodError(): SetupServiceError {
  return new SetupServiceError(
    "METHOD_NOT_ALLOWED",
    "This request method is not supported for the selected route.",
    { status: 405 },
  );
}

function internalContractError(): SetupServiceError {
  return new SetupServiceError(
    "SETUP_FAILED",
    "The setup service produced an invalid internal response.",
    { status: 500 },
  );
}

function sameOriginFetch(value: string | null): boolean {
  return value === null || value === "same-origin";
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function positiveInteger(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function secureRandomToken(): string {
  return randomBytes(32).toString("base64url");
}

function secureIdentifier(): string {
  return randomUUID().replaceAll("-", "");
}
