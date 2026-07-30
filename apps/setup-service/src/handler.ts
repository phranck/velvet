import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import {
  validateSetupEvent,
  validateSetupRequest,
  validateSetupSession,
  validateSetupStatus,
  type SetupEvent,
  type SetupRequest,
} from "@velvet/contracts";

import {
  createGitHubAuthorizationUrl,
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

const SESSION_MAX_AGE_SECONDS = 30 * 60;
const MAX_REQUEST_BYTES = 256 * 1_024;

type ProvisionFunction = typeof provisionVelvet;
type StaticAssetProvider = (path: string) => Promise<Response | null>;

interface SetupHandlerOptions {
  config: SetupServiceConfig;
  sessions: SessionStore;
  github: GitHubSetupClient;
  logger: AuditLogger;
  provision?: ProvisionFunction;
  staticAsset?: StaticAssetProvider;
  setupRateLimiter?: RateLimiter;
  authRateLimiter?: RateLimiter;
  randomToken?: () => string;
  requestId?: () => string;
  errorId?: () => string;
}

export function createSetupHandler(
  options: SetupHandlerOptions,
): (request: Request) => Promise<Response> {
  const provision = options.provision ?? provisionVelvet;
  const setupRateLimiter =
    options.setupRateLimiter ??
    createRateLimiter({ limit: 10, windowMs: 60_000, maxEntries: 2_000 });
  const authRateLimiter =
    options.authRateLimiter ??
    createRateLimiter({ limit: 30, windowMs: 60_000, maxEntries: 2_000 });
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
      secureResponse(response, currentRequestId, options.config.secureCookies);
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
        return finish(jsonResponse({ status: "ok" }));
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
        activeSession.oauth = {
          state: authorization.state,
          codeVerifier: authorization.codeVerifier,
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
        delete session.oauth;
        let userToken: string | undefined;
        try {
          userToken = await options.github.exchangeOAuthCode(code, codeVerifier);
          const viewer = await options.github.viewer(userToken);
          const authenticatedSession = options.sessions.rotate(session.id);
          authenticatedSession.githubUserToken = userToken;
          authenticatedSession.user = viewer;
          return finish(
            redirectResponse(`${options.config.publicOrigin}/onboarding/?github=connected`, {
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
            logger: options.logger,
            requestId: currentRequestId,
            errorId,
          }),
        );
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
      if (request.method === "GET" && route === "/onboarding") {
        return finish(redirectResponse(`${options.config.publicOrigin}/onboarding/`));
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
  logger: AuditLogger;
  requestId: string;
  errorId: () => string;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: SetupEvent): void => {
        if (!validateSetupEvent(event).success) {
          throw internalContractError();
        }
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
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
              errorId: () => currentErrorId,
            });
          } catch (cause) {
            const repository = input.session.provisioning?.repository;
            if (
              cause instanceof SetupServiceError &&
              cause.code === "INSTALLATION_REQUIRED" &&
              repository
            ) {
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
                  repositoryUrl: repository.htmlUrl,
                  error: publicError,
                };
              }
              emit({
                type: "permission-required",
                error: publicError,
                installationUrl: createGitHubInstallationUrl(
                  input.appSlug,
                  state,
                  repository.ownerId,
                  repository.id,
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
          emit({
            type: "error",
            error: publicSetupError(error, currentErrorId),
            recoverable: error.recoverable,
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
          try {
            controller.close();
          } catch {
            // The browser may have closed the stream after receiving a final event.
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

async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RequestTooLargeError();
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > MAX_REQUEST_BYTES) throw new RequestTooLargeError();
  return JSON.parse(new TextDecoder().decode(bytes));
}

class RequestTooLargeError extends Error {}

function allowlistedAssetPath(pathname: string): string | null {
  if (pathname === "/onboarding/") return "index.html";
  const match = /^\/onboarding\/(assets\/[A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(
    pathname,
  );
  return match?.[1] ?? null;
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
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
  secure: boolean,
): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Request-Id", requestId);
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://avatars.githubusercontent.com data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  if (secure) {
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
