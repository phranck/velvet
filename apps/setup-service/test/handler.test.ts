import assert from "node:assert/strict";
import { test } from "bun:test";

import type { SetupEvent } from "@velvet/contracts";

import type { SetupServiceConfig } from "../src/config.js";
import type { GitHubSetupClient } from "../src/github.js";
import { createSetupHandler } from "../src/handler.js";
import { createRateLimiter } from "../src/rate-limit.js";
import { createSessionStore } from "../src/session.js";

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
    async listInstallations() {
      return [{ id: 7, accountLogin: "example", accountType: "User" }];
    },
    async createRepositoryFromTemplate() { throw new Error("unused"); },
    async createInstallationToken() { throw new Error("unused"); },
    async getConfigurationSha() { throw new Error("unused"); },
    async writeConfiguration() { throw new Error("unused"); },
    async enablePages() { throw new Error("unused"); },
    async dispatchWorkflow() { throw new Error("unused"); },
    async workflowRun() { throw new Error("unused"); },
    async pages() { throw new Error("unused"); },
    async revokeUserToken() {},
    ...overrides,
  };
}

function harness(github = githubClient()) {
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

test("explains missing installation and organization approval without claiming success", async () => {
  const github = githubClient({ async listInstallations() { return []; } });
  const { handler, sessions } = harness(github);
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

  const firstEvent = JSON.parse((await (await request()).text()).trim());
  assert.equal(firstEvent.type, "permission-required");
  assert.equal(firstEvent.error.code, "INSTALLATION_REQUIRED");
  assert.match(firstEvent.installationUrl, /^https:\/\/github\.com\/apps\/velvet-setup\/installations\/new\?state=/);

  const session = sessions.fromCookie(browser.cookie)!;
  const callback = await handler(
    new Request(
      `${origin}/api/auth/installed?installation_id=7&setup_action=request&state=${session.installState}`,
      { headers: { Cookie: `__Host-velvet_session=${browser.cookie}` } },
    ),
  );
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get("Location"), `${origin}/onboarding/?github=approval-required`);

  const pendingEvent = JSON.parse((await (await request()).text()).trim());
  assert.equal(pendingEvent.type, "permission-required");
  assert.equal(pendingEvent.error.code, "ORGANIZATION_APPROVAL_REQUIRED");
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
