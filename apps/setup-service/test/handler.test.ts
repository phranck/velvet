import assert from "node:assert/strict";
import { test } from "bun:test";

import type { SetupEvent } from "@velvet/contracts";

import type { SetupServiceConfig } from "../src/config.js";
import type { GitHubSetupClient } from "../src/github.js";
import { createSetupHandler } from "../src/handler.js";
import type { AuditLogInput } from "../src/observability.js";
import { createRateLimiter } from "../src/rate-limit.js";
import { createSessionStore } from "../src/session.js";
import { SetupServiceError } from "../src/setup-error.js";

const origin = "https://setup.velvet.dev";
const config = {
  environment: "test",
  publicOrigin: origin,
  port: 3_000,
  secureCookies: true,
  github: {
    appId: "12345",
    appSlug: "velvet-setup",
    clientId: "Iv1.client",
    clientSecret: "client-secret-value",
    privateKey: "unused-in-handler-test",
  },
  sessionSecret: "s".repeat(32),
  public: { publicOrigin: origin, githubAppSlug: "velvet-setup" },
} satisfies SetupServiceConfig;

const setupBody = JSON.stringify({
  configuration: {
    schemaVersion: 1,
    repository: { owner: "example", name: "status" },
    statusPage: { name: "Example Status" },
    services: [{ name: "Website", url: "https://example.com" }],
  },
});

function githubClient(overrides: Partial<GitHubSetupClient> = {}): GitHubSetupClient {
  return {
    async exchangeOAuthCode() { return "user-token"; },
    async viewer() {
      return { login: "example", avatarUrl: "https://avatars.githubusercontent.com/u/1" };
    },
    async account() {
      return { id: 255_022_500, login: "example", type: "User" };
    },
    async listInstallations() {
      return [{
        id: 7,
        accountLogin: "example",
        accountType: "User",
        repositorySelection: "selected",
      }];
    },
    async createRepositoryFromTemplate() { throw new Error("unused"); },
    async createInstallationToken() { throw new Error("unused"); },
    async deleteInstallation() { throw new Error("unused"); },
    async getConfigurationSha() { throw new Error("unused"); },
    async writeConfiguration() { throw new Error("unused"); },
    async writeManagedFiles() { throw new Error("unused"); },
    async enablePages() { throw new Error("unused"); },
    async configurePagesCustomDomain() { throw new Error("unused"); },
    async dispatchWorkflow() { throw new Error("unused"); },
    async workflowJobs() { throw new Error("unused"); },
    async workflowRun() { throw new Error("unused"); },
    async pages() { throw new Error("unused"); },
    async revokeUserToken() {},
    ...overrides,
  };
}

function harness(
  github = githubClient(),
  logger: Parameters<typeof createSetupHandler>[0]["logger"] = () => {},
  updates?: Parameters<typeof createSetupHandler>[0]["updates"],
) {
  let tokenIndex = 0;
  let idIndex = 0;
  const sessions = createSessionStore({
    secret: config.sessionSecret,
    randomToken: () => `${tokenIndex++}`.padStart(43, "A"),
  });
  const handler = createSetupHandler({
    config,
    sessions,
    github,
    logger,
    ...(updates ? { updates } : {}),
    randomToken: () => `${tokenIndex++}`.padStart(43, "B"),
    requestId: () => `request${idIndex++}`.padEnd(20, "0"),
    errorId: () => `error${idIndex++}`.padEnd(20, "0"),
    provision: async ({ session, onEvent }) => {
      const progress: SetupEvent = { type: "progress", stage: "creating-repository" };
      const success: SetupEvent = {
        type: "success",
        installationUrl: "https://example.github.io/status/",
        repositoryUrl: "https://github.com/example/status",
        workflowRunId: 777,
      };
      session.operation = {
        operationId: "O".repeat(26),
        state: "succeeded",
        stage: "waiting-for-deployment",
        installationUrl: success.installationUrl,
        repositoryUrl: success.repositoryUrl,
        workflowRunId: 777,
      };
      onEvent(progress);
      onEvent(success);
      return success;
    },
  });
  return { handler, sessions };
}

function realProvisionHarness(github: GitHubSetupClient) {
  let tokenIndex = 0;
  let idIndex = 0;
  const sessions = createSessionStore({
    secret: config.sessionSecret,
    randomToken: () => `${tokenIndex++}`.padStart(43, "A"),
  });
  const handler = createSetupHandler({
    config,
    sessions,
    github,
    logger: () => {},
    randomToken: () => `${tokenIndex++}`.padStart(43, "B"),
    requestId: () => `request${idIndex++}`.padEnd(20, "0"),
    errorId: () => `error${idIndex++}`.padEnd(20, "0"),
  });
  return { handler, sessions };
}

async function createBrowserSession(
  handler: (request: Request) => Promise<Response>,
): Promise<{ cookie: string; csrfToken: string }> {
  const response = await handler(new Request(`${origin}/api/session`));
  const cookie = response.headers.get("Set-Cookie")!.split(";", 1)[0]!.split("=", 2)[1]!;
  const body = await response.json() as { csrfToken: string };
  return { cookie, csrfToken: body.csrfToken };
}

async function authenticate(
  handler: (request: Request) => Promise<Response>,
  sessions: ReturnType<typeof createSessionStore>,
): Promise<{ cookie: string; csrfToken: string }> {
  const browser = await createBrowserSession(handler);
  const start = await handler(
    new Request(`${origin}/api/auth/start`, {
      headers: { Cookie: `__Host-velvet_session=${browser.cookie}` },
    }),
  );
  assert.equal(start.status, 302);
  const session = sessions.fromCookie(browser.cookie)!;
  assert.ok(session.oauth);
  const callback = await handler(
    new Request(
      `${origin}/api/auth/callback?code=oauth-code&state=${session.oauth.state}`,
      { headers: { Cookie: `__Host-velvet_session=${browser.cookie}` } },
    ),
  );
  assert.equal(callback.status, 302);
  const cookie = callback.headers.get("Set-Cookie")!.split(";", 1)[0]!.split("=", 2)[1]!;
  const current = await handler(
    new Request(`${origin}/api/session`, {
      headers: { Cookie: `__Host-velvet_session=${cookie}` },
    }),
  );
  const body = await current.json() as { authenticated: boolean; csrfToken: string };
  assert.equal(body.authenticated, true);
  return { cookie, csrfToken: body.csrfToken };
}

test("creates only a signed session cookie and applies security headers", async () => {
  const { handler } = harness();
  const response = await handler(new Request(`${origin}/api/session`));
  const body = await response.json() as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.authenticated, false);
  assert.equal(typeof body.csrfToken, "string");
  assert.doesNotMatch(JSON.stringify(body), /client-secret|user-token|PRIVATE KEY/);
  assert.match(response.headers.get("Set-Cookie")!, /HttpOnly; SameSite=Lax; Secure$/);
  assert.match(response.headers.get("Content-Security-Policy")!, /default-src 'self'/);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("uses one-time OAuth state and rotates the authenticated session", async () => {
  const { handler, sessions } = harness();
  const browser = await createBrowserSession(handler);
  const start = await handler(
    new Request(`${origin}/api/auth/start`, {
      headers: { Cookie: `__Host-velvet_session=${browser.cookie}` },
    }),
  );
  const authorizationUrl = new URL(start.headers.get("Location")!);
  const oldSession = sessions.fromCookie(browser.cookie)!;
  assert.equal(authorizationUrl.origin, "https://github.com");
  assert.equal(authorizationUrl.searchParams.get("state"), oldSession.oauth?.state);
  assert.equal(authorizationUrl.searchParams.get("code_challenge_method"), "S256");

  const badCallback = await handler(
    new Request(`${origin}/api/auth/callback?code=oauth-code&state=${"Z".repeat(43)}`, {
      headers: { Cookie: `__Host-velvet_session=${browser.cookie}` },
    }),
  );
  assert.equal(badCallback.status, 400);
  assert.equal((await badCallback.json()).error.code, "AUTHENTICATION_FAILED");

  const callback = await handler(
    new Request(
      `${origin}/api/auth/callback?code=oauth-code&state=${oldSession.oauth?.state}`,
      { headers: { Cookie: `__Host-velvet_session=${browser.cookie}` } },
    ),
  );
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("Location"), `${origin}/onboarding/?github=connected`);
  assert.equal(sessions.fromCookie(browser.cookie), null);
  const newCookie = callback.headers.get("Set-Cookie")!.split(";", 1)[0]!.split("=", 2)[1]!;
  assert.equal(sessions.fromCookie(newCookie)?.githubUserToken, "user-token");

  const replay = await handler(
    new Request(
      `${origin}/api/auth/callback?code=oauth-code&state=${oldSession.oauth?.state}`,
      { headers: { Cookie: `__Host-velvet_session=${newCookie}` } },
    ),
  );
  assert.equal(replay.status, 400);
});

test("requires exact origin and CSRF before streaming setup progress", async () => {
  const { handler, sessions } = harness();
  const browser = await authenticate(handler, sessions);
  const cookieHeader = { Cookie: `__Host-velvet_session=${browser.cookie}` };

  const missingOrigin = await handler(
    new Request(`${origin}/api/setup`, {
      method: "POST",
      headers: { ...cookieHeader, "Content-Type": "application/json", "X-Velvet-CSRF": browser.csrfToken },
      body: setupBody,
    }),
  );
  assert.equal(missingOrigin.status, 403);
  assert.equal((await missingOrigin.json()).error.code, "ORIGIN_REJECTED");

  const missingCsrf = await handler(
    new Request(`${origin}/api/setup`, {
      method: "POST",
      headers: { ...cookieHeader, Origin: origin, "Content-Type": "application/json" },
      body: setupBody,
    }),
  );
  assert.equal(missingCsrf.status, 403);
  assert.equal((await missingCsrf.json()).error.code, "CSRF_REJECTED");

  const response = await handler(
    new Request(`${origin}/api/setup`, {
      method: "POST",
      headers: {
        ...cookieHeader,
        Origin: origin,
        "Sec-Fetch-Site": "same-origin",
        "Content-Type": "application/json",
        "X-Velvet-CSRF": browser.csrfToken,
      },
      body: setupBody,
    }),
  );
  const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/x-ndjson; charset=utf-8");
  assert.deepEqual(events.map((event) => event.type), ["progress", "success"]);
});

test("closes the setup response as soon as the background workflow starts", async () => {
  let releaseProvisioning: (() => void) | undefined;
  let provisioningFinished = false;
  let tokenIndex = 0;
  const sessions = createSessionStore({
    secret: config.sessionSecret,
    randomToken: () => `${tokenIndex++}`.padStart(43, "A"),
  });
  const handler = createSetupHandler({
    config,
    sessions,
    github: githubClient(),
    logger: () => {},
    provision: async ({ session, onEvent }) => {
      session.operation = {
        operationId: "O".repeat(26),
        state: "running",
        stage: "starting-monitor",
      };
      onEvent({ type: "progress", stage: "starting-monitor" });
      await new Promise<void>((resolve) => {
        releaseProvisioning = resolve;
      });
      provisioningFinished = true;
      const success: SetupEvent = {
        type: "success",
        installationUrl: "https://example.github.io/status/",
        repositoryUrl: "https://github.com/example/status",
      };
      session.operation = {
        operationId: "O".repeat(26),
        state: "succeeded",
        stage: "waiting-for-deployment",
        installationUrl: success.installationUrl,
        repositoryUrl: success.repositoryUrl,
      };
      onEvent(success);
      return success;
    },
  });
  const browser = await authenticate(handler, sessions);
  const response = await handler(
    new Request(`${origin}/api/setup`, {
      method: "POST",
      headers: {
        Cookie: `__Host-velvet_session=${browser.cookie}`,
        Origin: origin,
        "Content-Type": "application/json",
        "X-Velvet-CSRF": browser.csrfToken,
      },
      body: setupBody,
    }),
  );
  let responseClosed = false;
  const bodyPromise = response.text().then((body) => {
    responseClosed = true;
    return body;
  });

  await Bun.sleep(25);
  const closedBeforeProvisioningFinished = responseClosed;
  releaseProvisioning?.();
  const body = await bodyPromise;

  assert.equal(closedBeforeProvisioningFinished, true);
  assert.equal(provisioningFinished, true);
  assert.deepEqual(body.trim().split("\n").map((line) => JSON.parse(line)), [
    { type: "progress", stage: "starting-monitor" },
  ]);
});

test("returns safe repository and workflow recovery targets after setup fails", async () => {
  let tokenIndex = 0;
  const sessions = createSessionStore({
    secret: config.sessionSecret,
    randomToken: () => `${tokenIndex++}`.padStart(43, "A"),
  });
  const handler = createSetupHandler({
    config,
    sessions,
    github: githubClient(),
    logger: () => {},
    errorId: () => "E".repeat(26),
    provision: async ({ session }) => {
      session.operation = {
        operationId: "O".repeat(26),
        state: "failed",
        stage: "building-page",
        repositoryUrl: "https://github.com/example/status",
        workflowRunId: 777,
        error: {
          code: "WORKFLOW_FAILED",
          message: "The initial Velvet workflow did not complete successfully.",
          errorId: "E".repeat(26),
        },
      };
      throw new SetupServiceError(
        "WORKFLOW_FAILED",
        "The initial Velvet workflow did not complete successfully.",
        { recoverable: true },
      );
    },
  });
  const browser = await authenticate(handler, sessions);
  const response = await handler(
    new Request(`${origin}/api/setup`, {
      method: "POST",
      headers: {
        Cookie: `__Host-velvet_session=${browser.cookie}`,
        Origin: origin,
        "Content-Type": "application/json",
        "X-Velvet-CSRF": browser.csrfToken,
      },
      body: setupBody,
    }),
  );
  const event = JSON.parse((await response.text()).trim());

  assert.equal(event.type, "error");
  assert.equal(event.error.errorId, "E".repeat(26));
  assert.equal(event.repositoryUrl, "https://github.com/example/status");
  assert.equal(event.workflowRunId, 777);
});

test("explains missing installation and organization approval without claiming success", async () => {
  const github = githubClient({
    async listInstallations() { return []; },
    async createRepositoryFromTemplate() {
      return {
        id: 123_456_789,
        name: "status",
        owner: "example",
        ownerId: 255_022_500,
        htmlUrl: "https://github.com/example/status",
        defaultBranch: "main",
      };
    },
  });
  const { handler, sessions } = realProvisionHarness(github);
  const browser = await authenticate(handler, sessions);
  const request = () =>
    handler(
      new Request(`${origin}/api/setup`, {
        method: "POST",
        headers: {
          Cookie: `__Host-velvet_session=${browser.cookie}`,
          Origin: origin,
          "Content-Type": "application/json",
          "X-Velvet-CSRF": browser.csrfToken,
        },
        body: setupBody,
      }),
    );

  const firstEvents = (await (await request()).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const firstEvent = firstEvents.at(-1);
  assert.equal(firstEvent.type, "permission-required");
  assert.equal(firstEvent.error.code, "INSTALLATION_REQUIRED");
  assert.match(
    firstEvent.installationUrl,
    /^https:\/\/github\.com\/apps\/velvet-setup\/installations\/new\/permissions\?/,
  );

  const session = sessions.fromCookie(browser.cookie)!;
  const callback = await handler(
    new Request(
      `${origin}/api/auth/installed?installation_id=7&setup_action=request&state=${session.installState}`,
      { headers: { Cookie: `__Host-velvet_session=${browser.cookie}` } },
    ),
  );
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("Location"), `${origin}/onboarding/?github=approval-required`);

  const pendingEvent = (await (await request()).text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .at(-1);
  assert.equal(pendingEvent.type, "permission-required");
  assert.equal(pendingEvent.error.code, "ORGANIZATION_APPROVAL_REQUIRED");
});

test("uses a temporary installation only to create the repository, then offers repository-only access", async () => {
  let installationMode: "none" | "all" | "selected" = "none";
  let deletedInstallation = 0;
  const github = githubClient({
    async listInstallations() {
      return installationMode === "none"
        ? []
        : [{
            id: 7,
            accountLogin: "example",
            accountType: "User",
            repositorySelection: installationMode,
          }];
    },
    async createRepositoryFromTemplate() {
      return {
        id: 123_456_789,
        name: "status",
        owner: "example",
        ownerId: 255_022_500,
        htmlUrl: "https://github.com/example/status",
        defaultBranch: "main",
      };
    },
    async deleteInstallation(installationId) {
      deletedInstallation = installationId;
      installationMode = "none";
    },
  });
  const { handler, sessions } = realProvisionHarness(github);
  const browser = await authenticate(handler, sessions);
  const request = async () => {
    const response = await handler(
      new Request(`${origin}/api/setup`, {
        method: "POST",
        headers: {
          Cookie: `__Host-velvet_session=${browser.cookie}`,
          Origin: origin,
          "Content-Type": "application/json",
          "X-Velvet-CSRF": browser.csrfToken,
        },
        body: setupBody,
      }),
    );
    return (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
  };

  const firstEvents = await request();
  assert.equal(firstEvents.at(-1).access, "temporary-account");
  const bootstrapUrl = new URL(firstEvents.at(-1).installationUrl);
  assert.equal(bootstrapUrl.searchParams.get("suggested_target_id"), "255022500");
  assert.deepEqual(bootstrapUrl.searchParams.getAll("repository_ids[]"), []);

  let session = sessions.fromCookie(browser.cookie)!;
  installationMode = "all";
  const bootstrapCallback = await handler(
    new Request(
      `${origin}/api/auth/installed?installation_id=7&setup_action=install&state=${session.installState}`,
      { headers: { Cookie: `__Host-velvet_session=${browser.cookie}` } },
    ),
  );
  assert.equal(bootstrapCallback.status, 302);

  const secondEvents = await request();
  assert.equal(secondEvents.at(-1).access, "repository");
  const installationUrl = new URL(secondEvents.at(-1).installationUrl);
  assert.equal(
    installationUrl.pathname,
    "/apps/velvet-setup/installations/new/permissions",
  );
  assert.equal(installationUrl.searchParams.get("suggested_target_id"), "255022500");
  assert.deepEqual(installationUrl.searchParams.getAll("repository_ids[]"), [
    "123456789",
  ]);
  assert.equal(deletedInstallation, 7);
  session = sessions.fromCookie(browser.cookie)!;
  assert.equal(session.provisioning?.repository?.id, 123_456_789);
  assert.equal(session.installation, undefined);
  assert.equal(session.installState, installationUrl.searchParams.get("state"));
});

test("rejects an installation id that GitHub did not grant to the authenticated user", async () => {
  let installationChecks = 0;
  const github = githubClient({
    async listInstallations() {
      installationChecks += 1;
      return installationChecks === 1
        ? []
        : [{
            id: 7,
            accountLogin: "example",
            accountType: "User",
            repositorySelection: "selected",
          }];
    },
    async createRepositoryFromTemplate() {
      return {
        id: 123_456_789,
        name: "status",
        owner: "example",
        ownerId: 255_022_500,
        htmlUrl: "https://github.com/example/status",
        defaultBranch: "main",
      };
    },
  });
  const { handler, sessions } = realProvisionHarness(github);
  const browser = await authenticate(handler, sessions);
  const setup = await handler(
    new Request(`${origin}/api/setup`, {
      method: "POST",
      headers: {
        Cookie: `__Host-velvet_session=${browser.cookie}`,
        Origin: origin,
        "Content-Type": "application/json",
        "X-Velvet-CSRF": browser.csrfToken,
      },
      body: setupBody,
    }),
  );
  await setup.text();
  const session = sessions.fromCookie(browser.cookie)!;
  assert.ok(session.installState);

  const callback = await handler(
    new Request(
      `${origin}/api/auth/installed?installation_id=999&setup_action=install&state=${session.installState}`,
      { headers: { Cookie: `__Host-velvet_session=${browser.cookie}` } },
    ),
  );
  assert.equal(callback.status, 403);
  assert.equal((await callback.json()).error.code, "INSTALLATION_REQUIRED");
  assert.equal(session.installation, undefined);
});

test("returns safe status, revokes authorization on logout, and destroys the session", async () => {
  let revokedToken = "";
  const github = githubClient({ async revokeUserToken(token) { revokedToken = token; } });
  const { handler, sessions } = harness(github);
  const browser = await authenticate(handler, sessions);
  const session = sessions.fromCookie(browser.cookie)!;
  session.operation = {
    operationId: "O".repeat(26),
    state: "running",
    stage: "waiting-for-deployment",
  };

  const status = await handler(
    new Request(`${origin}/api/setup/status`, {
      headers: { Cookie: `__Host-velvet_session=${browser.cookie}` },
    }),
  );
  assert.equal((await status.json()).operationId, "O".repeat(26));

  const logout = await handler(
    new Request(`${origin}/api/logout`, {
      method: "POST",
      headers: {
        Cookie: `__Host-velvet_session=${browser.cookie}`,
        Origin: origin,
        "X-Velvet-CSRF": browser.csrfToken,
      },
    }),
  );
  assert.equal(logout.status, 204);
  assert.equal(revokedToken, "user-token");
  assert.equal(sessions.fromCookie(browser.cookie), null);
  assert.match(logout.headers.get("Set-Cookie")!, /Max-Age=0/);
});

test("destroys the local session when GitHub token revocation fails", async () => {
  const events: AuditLogInput[] = [];
  const github = githubClient({
    async revokeUserToken() {
      throw new Error("upstream response containing secret-token");
    },
  });
  const { handler, sessions } = harness(github, (event) => events.push(event));
  const browser = await authenticate(handler, sessions);

  const logout = await handler(
    new Request(`${origin}/api/logout`, {
      method: "POST",
      headers: {
        Cookie: `__Host-velvet_session=${browser.cookie}`,
        Origin: origin,
        "X-Velvet-CSRF": browser.csrfToken,
      },
    }),
  );

  assert.equal(logout.status, 204);
  assert.equal(sessions.fromCookie(browser.cookie), null);
  assert.match(logout.headers.get("Set-Cookie")!, /Max-Age=0/);
  assert.equal(events.at(-1)?.operation, "logout-revoke");
  assert.equal(events.at(-1)?.outcome, "fallback");
  assert.doesNotMatch(JSON.stringify(events), /secret-token/);
});

test("bounds setup attempts and rejects oversized bodies before parsing", async () => {
  const { handler, sessions } = harness();
  const browser = await authenticate(handler, sessions);
  const limited = createSetupHandler({
    config,
    sessions,
    github: githubClient(),
    logger: () => {},
    setupRateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000, maxEntries: 10 }),
  });
  const headers = {
    Cookie: `__Host-velvet_session=${browser.cookie}`,
    Origin: origin,
    "Content-Type": "application/json",
    "X-Velvet-CSRF": browser.csrfToken,
  };
  await limited(new Request(`${origin}/api/setup`, { method: "POST", headers, body: setupBody }));
  const rateLimited = await limited(
    new Request(`${origin}/api/setup`, { method: "POST", headers, body: setupBody }),
  );
  assert.equal(rateLimited.status, 429);
  assert.equal((await rateLimited.json()).error.code, "RATE_LIMITED");
  assert.equal(rateLimited.headers.get("Retry-After"), "60");

  const oversized = await handler(
    new Request(`${origin}/api/setup`, {
      method: "POST",
      headers: { ...headers, "Content-Length": "999999" },
      body: setupBody,
    }),
  );
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "INVALID_SETUP_REQUEST");
});

test("serves only allowlisted onboarding assets", async () => {
  const served: string[] = [];
  const { sessions } = harness();
  const handler = createSetupHandler({
    config,
    sessions,
    github: githubClient(),
    logger: () => {},
    staticAsset: async (path) => {
      served.push(path);
      return new Response("asset");
    },
  });

  assert.equal((await handler(new Request(`${origin}/onboarding/`))).status, 200);
  assert.equal((await handler(new Request(`${origin}/onboarding/assets/app.js`))).status, 200);
  assert.equal((await handler(new Request(`${origin}/onboarding/../secret`))).status, 404);
  assert.deepEqual(served, ["index.html", "assets/app.js"]);
  const missing = await handler(new Request(`${origin}/api/unknown`));
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "NOT_FOUND");
});

/** Records what the handler forwarded, so the boundary can be tested alone. */
function recordingUpdateRoutes() {
  const seen: { route: string; method: string }[] = [];
  return {
    seen,
    routes: {
      async handle(input: {
        route: string;
        request: Request;
      }): Promise<Response | null> {
        seen.push({ route: input.route, method: input.request.method });
        return input.request.method === "DELETE"
          ? null
          : Response.json({ forwarded: true });
      },
    },
  };
}

test("reaches the update routes only through an authenticated session", async () => {
  const recorder = recordingUpdateRoutes();
  const { handler, sessions } = harness(
    githubClient(),
    () => {},
    recorder.routes,
  );

  for (const route of ["/api/updates", "/api/installations"]) {
    const anonymous = await handler(new Request(`${origin}${route}`));
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json()).error.code, "AUTHENTICATION_REQUIRED");
  }
  assert.deepEqual(recorder.seen, [], "nothing reaches the routes unauthenticated");

  const browser = await authenticate(handler, sessions);
  const response = await handler(
    new Request(`${origin}/api/updates?installation=7&repository=9`, {
      headers: { Cookie: `__Host-velvet_session=${browser.cookie}` },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { forwarded: true });
  assert.deepEqual(recorder.seen, [{ route: "/api/updates", method: "GET" }]);
});

test("holds update writes to the same origin and CSRF rules as setup", async () => {
  const recorder = recordingUpdateRoutes();
  const { handler, sessions } = harness(
    githubClient(),
    () => {},
    recorder.routes,
  );
  const browser = await authenticate(handler, sessions);

  const withoutToken = await handler(
    new Request(`${origin}/api/updates`, {
      method: "POST",
      headers: {
        Cookie: `__Host-velvet_session=${browser.cookie}`,
        Origin: origin,
      },
    }),
  );
  assert.equal(withoutToken.status, 403);
  assert.equal((await withoutToken.json()).error.code, "CSRF_REJECTED");

  const foreignOrigin = await handler(
    new Request(`${origin}/api/updates`, {
      method: "POST",
      headers: {
        Cookie: `__Host-velvet_session=${browser.cookie}`,
        Origin: "https://attacker.example",
        "X-Velvet-CSRF": browser.csrfToken,
      },
    }),
  );
  assert.equal(foreignOrigin.status, 403);
  assert.equal((await foreignOrigin.json()).error.code, "ORIGIN_REJECTED");
  assert.deepEqual(recorder.seen, [], "no write reaches the routes unproven");

  const accepted = await handler(
    new Request(`${origin}/api/updates`, {
      method: "POST",
      headers: {
        Cookie: `__Host-velvet_session=${browser.cookie}`,
        Origin: origin,
        "X-Velvet-CSRF": browser.csrfToken,
      },
    }),
  );
  assert.equal(accepted.status, 200);
  assert.deepEqual(recorder.seen, [{ route: "/api/updates", method: "POST" }]);
});

test("reports an unsupported update method rather than forwarding it", async () => {
  const recorder = recordingUpdateRoutes();
  const { handler, sessions } = harness(
    githubClient(),
    () => {},
    recorder.routes,
  );
  const browser = await authenticate(handler, sessions);

  const response = await handler(
    new Request(`${origin}/api/updates`, {
      method: "DELETE",
      headers: {
        Cookie: `__Host-velvet_session=${browser.cookie}`,
        Origin: origin,
        "X-Velvet-CSRF": browser.csrfToken,
      },
    }),
  );

  assert.equal(response.status, 405);
  assert.equal((await response.json()).error.code, "METHOD_NOT_ALLOWED");
});
