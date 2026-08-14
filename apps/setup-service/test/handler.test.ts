import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  MAX_SETUP_LOGO_BASE64_BYTES,
  MAX_SETUP_REQUEST_BYTES,
  type SetupEvent,
} from "@velvet/contracts";

import type { SetupServiceConfig } from "../src/config.js";
import type { GitHubSetupClient } from "../src/github.js";
import { createSetupHandler } from "../src/handler.js";
import type { AuditLogInput } from "../src/observability.js";
import { createRateLimiter } from "../src/rate-limit.js";
import { createSessionStore } from "../src/session.js";
import { SetupServiceError } from "../src/setup-error.js";

const origin = "https://setup.velvet.dev";
const website = "https://velvet.dev";
const config = {
  environment: "test",
  publicOrigin: origin,
  websiteOrigin: website,
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
  automaticUpdateIntervalMs: 0,
  serialCounter: null,
  notify: null,
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
    async repositoryReadable() { return true; },
    async findRepository() { return null; },
    async repositoryInstallationId() { return null; },
    async deleteRepository() {},
    async createRepository() { throw new Error("unused"); },
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
  const policy = response.headers.get("Content-Security-Policy")!;
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self'/);
  // Style attributes are allowed because a themed preview carries per-element
  // custom properties. Stylesheets are not, which is the part that matters.
  assert.match(policy, /style-src 'self'/);
  assert.match(policy, /style-src-attr 'unsafe-inline'/);
  assert.equal(policy.includes("style-src 'self' 'unsafe-inline'"), false);
  assert.equal(policy.includes("script-src 'self' 'unsafe-inline'"), false);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);

  // This instance configures no analytics, so it grants no third origin at all.
  // Anyone running their own copy of Velvet gets exactly this policy.
  const directive = (name: string) =>
    policy
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? "";
  assert.equal(directive("script-src"), "script-src 'self'");
  assert.equal(
    directive("connect-src"),
    "connect-src 'self'",
  );
  // Nothing else was widened along with it.
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.equal(directive("default-src"), "default-src 'self'");
});

test("grants no third-party origin any script or connection", async () => {
  const { handler } = harness();

  const response = await handler(
    new Request(`${origin}/healthz`, { method: "GET" }),
  );
  const policy = response.headers.get("Content-Security-Policy")!;
  const directive = (name: string) =>
    policy
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? "";

  // Velvet observes nobody, so no analytics origin appears here whatever the
  // environment says. A tracker would need a grant in both directives, which is
  // why both are asserted rather than one.
  assert.equal(directive("script-src"), "script-src 'self'");
  // Nothing this service hosts talks to another origin, so the policy grants
  // none.
  assert.equal(directive("connect-src"), "connect-src 'self'");
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
    async findRepository() { return null; },
    async repositoryInstallationId() { return null; },
    async deleteRepository() {},
    async createRepository() {
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
    async findRepository() { return null; },
    async repositoryInstallationId() { return null; },
    async deleteRepository() {},
    async createRepository() {
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

test("reports plainly that it cannot delete the repository in the way", async () => {
  const github = githubClient({
    async findRepository() {
      return {
        id: 4_242,
        name: "status",
        owner: "example",
        ownerId: 255_022_500,
        htmlUrl: "https://github.com/example/status",
        defaultBranch: "main",
      };
    },
    async repositoryInstallationId() { return null; },
    async deleteRepository() {
      throw new Error("The deletion must not be attempted without access.");
    },
    async createRepository() {
      throw new Error("Nothing is created whilst the name is still taken.");
    },
  });
  const { handler, sessions } = realProvisionHarness(github);
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
      body: JSON.stringify({
        ...JSON.parse(setupBody),
        replaceExistingRepository: true,
      }),
    }),
  );
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  // An answerable stop rather than a redirect: the repository is theirs to
  // delete, or the name is theirs to change.
  assert.equal(events.at(-1).type, "error");
  assert.equal(events.at(-1).error.code, "REPOSITORY_NOT_DELETABLE");
  assert.equal(events.at(-1).recoverable, true);
  assert.match(events.at(-1).error.message, /Delete it on GitHub yourself/u);
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
    async findRepository() { return null; },
    async repositoryInstallationId() { return null; },
    async deleteRepository() {},
    async createRepository() {
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

test("serves both hosted applications and nothing else", async () => {
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

  for (const app of ["onboarding"]) {
    assert.equal((await handler(new Request(`${origin}/${app}/`))).status, 200);
    assert.equal(
      (await handler(new Request(`${origin}/${app}/assets/app.js`))).status,
      200,
    );
    assert.equal(
      (await handler(new Request(`${origin}/${app}/../secret`))).status,
      404,
    );
    // A bare path is a common way to arrive, and resolving it relatively would
    // otherwise ask the browser for the wrong asset directory.
    const bare = await handler(new Request(`${origin}/${app}`));
    assert.equal(bare.status, 302);
    assert.equal(bare.headers.get("Location"), `${origin}/${app}/`);
  }

  assert.deepEqual(served, [
    "onboarding/index.html",
    "onboarding/assets/app.js",
  ]);
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

test("reports the next serial, and nothing when no registry is configured", async () => {
  const { handler } = harness();
  const withoutRegistry = await handler(new Request(`${origin}/api/serial`));
  assert.equal(withoutRegistry.status, 200);
  assert.deepEqual(await withoutRegistry.json(), { next: null });

  // The number is decoration on a backdrop, so an instance without a registry
  // answers plainly rather than failing, and onboarding shows nothing.
  const counting = createSetupHandler({
    config,
    sessions: createSessionStore({ secret: config.sessionSecret }),
    github: githubClient(),
    logger: () => {},
    serials: {
      peek: async () => 42,
      claim: async () => 42,
      listed: async () => [],
      listedRepositories: async () => [],
      recordedRepositories: async () => [],
      setUnreachable: async () => false,
      forgetUnreachableSince: async () => [],
      setListed: async () => false,
    },
  });
  const response = await counting(new Request(`${origin}/api/serial`));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { next: 42 });
  assert.equal(
    response.headers.get("Set-Cookie"),
    null,
    "reading the counter needs no session",
  );
});

test("a serial the counter refuses does not fail the endpoint", async () => {
  const handler = createSetupHandler({
    config,
    sessions: createSessionStore({ secret: config.sessionSecret }),
    github: githubClient(),
    logger: () => {},
    serials: {
      peek: async () => null,
      claim: async () => {
        throw new Error("unreachable");
      },
      listed: async () => [],
      listedRepositories: async () => [],
      recordedRepositories: async () => [],
      setUnreachable: async () => false,
      forgetUnreachableSince: async () => [],
      setListed: async () => false,
    },
  });
  const response = await handler(new Request(`${origin}/api/serial`));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { next: null });
});

test("reports on the health route which sources this build was made from", async () => {
  const { DEPLOYMENT_FINGERPRINT } = await import(
    "../src/deployment-fingerprint.generated.js"
  );
  const { handler } = harness();

  const response = await handler(
    new Request("https://setup.example/healthz", { method: "GET" }),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    status: string;
    fingerprint: string;
  };
  assert.equal(body.status, "ok");
  // A check on main compares this against the same hash computed from the
  // repository, which is the only way the gap between a merge and a hand
  // deploy becomes visible at all.
  assert.equal(body.fingerprint, DEPLOYMENT_FINGERPRINT);
  assert.match(body.fingerprint, /^[0-9a-f]{64}$/u);
});

test("the gallery names only the pages whose owners agreed, and nothing else", async () => {
  const handler = createSetupHandler({
    config,
    sessions: createSessionStore({ secret: config.sessionSecret }),
    github: githubClient(),
    logger: () => {},
    serials: {
      peek: async () => 42,
      claim: async () => 42,
      listed: async () => [
        { statusPageName: "Example", url: "https://status.example.com" },
      ],
      listedRepositories: async () => ["example/status"],
      recordedRepositories: async () => [],
      setUnreachable: async () => false,
      forgetUnreachableSince: async () => [],
      setListed: async () => false,
    },
  });

  const response = await handler(new Request(`${origin}/api/references`));

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), {
    entries: [{ statusPageName: "Example", url: "https://status.example.com" }],
  });
  // The registry also knows the repository, the account behind it, and when
  // each installation joined. A GitHub account names a person, so none of that
  // may leave the private counter.
  assert.equal(body.includes("repository"), false);
  assert.equal(body.includes("issuedAt"), false);
  assert.equal(body.includes("serial"), false);
  assert.equal(
    response.headers.get("Set-Cookie"),
    null,
    "reading the gallery needs no session",
  );
});

test("an unreadable registry reports nothing rather than an empty gallery", async () => {
  const handler = createSetupHandler({
    config,
    sessions: createSessionStore({ secret: config.sessionSecret }),
    github: githubClient(),
    logger: () => {},
    serials: {
      peek: async () => null,
      claim: async () => 42,
      listed: async () => null,
      listedRepositories: async () => [],
      recordedRepositories: async () => [],
      setUnreachable: async () => false,
      forgetUnreachableSince: async () => [],
      setListed: async () => false,
    },
  });

  const response = await handler(new Request(`${origin}/api/references`));

  // Distinct from an empty list on purpose: nobody has agreed and the registry
  // cannot be read are different facts, and the page says nothing for either
  // rather than claiming Velvet has no references.
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { entries: null });
});

test("an instance without a registry answers the gallery plainly", async () => {
  const handler = createSetupHandler({
    config,
    sessions: createSessionStore({ secret: config.sessionSecret }),
    github: githubClient(),
    logger: () => {},
  });

  const response = await handler(new Request(`${origin}/api/references`));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { entries: null });
});

test("only the gallery may be read from the website, and only by it", async () => {
  // The list is served here and rendered by a page on another origin, so
  // without this the browser discards a perfectly good answer and the page
  // shows an empty gallery however many installations have consented.
  const { handler } = harness();

  const gallery = await handler(new Request(`${origin}/api/references`));
  assert.equal(gallery.headers.get("Access-Control-Allow-Origin"), website);
  // The second lock behind the first. Granting one and not the other refuses
  // the same read again, with an error that looks like the original.
  assert.equal(gallery.headers.get("Cross-Origin-Resource-Policy"), "cross-origin");
  // The answer now depends on who asked, and a shared cache that missed that
  // would hand this body to somebody else.
  assert.equal(gallery.headers.get("Vary"), "Origin");
  // Named rather than opened to everybody, since a wildcard would let any page
  // anywhere read it.
  assert.notEqual(gallery.headers.get("Access-Control-Allow-Origin"), "*");

  // Every other route stays shut, including the two that also need no session.
  for (const route of ["/api/serial", "/healthz", "/api/session"]) {
    const response = await handler(new Request(`${origin}${route}`));
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      null,
      `${route} may not be read from another origin`,
    );
    assert.equal(
      response.headers.get("Cross-Origin-Resource-Policy"),
      "same-origin",
      `${route} kept its resource policy`,
    );
  }
});

test("an instance serving no website grants the gallery to nobody", async () => {
  const handler = createSetupHandler({
    config: { ...config, websiteOrigin: null },
    sessions: createSessionStore({ secret: config.sessionSecret }),
    github: githubClient(),
    logger: () => {},
  });

  const response = await handler(new Request(`${origin}/api/references`));

  // Somebody running their own copy without a website of their own is not
  // guessed at. The list still answers; nothing may read it from elsewhere.
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  assert.equal(response.headers.get("Cross-Origin-Resource-Policy"), "same-origin");
});

test("the largest logo the browser offers still fits inside a setup request", () => {
  // The browser sizes a file against MAX_SETUP_LOGO_BYTES and this service
  // refuses a body over MAX_SETUP_REQUEST_BYTES. Anything the field accepts has
  // to survive the door, or somebody watches setup fail on a file they were
  // just told was fine.
  const body = JSON.stringify({
    configuration: {
      schemaVersion: 1,
      repository: { owner: "example", name: "status" },
      statusPage: { name: "Example Status" },
      services: [{ name: "Website", url: "https://example.com" }],
    },
    repositoryVisibility: "public",
    logo: { type: "image/png", content: "A".repeat(MAX_SETUP_LOGO_BASE64_BYTES) },
  });

  assert.ok(
    Buffer.byteLength(body, "utf8") <= MAX_SETUP_REQUEST_BYTES,
    `a maximum logo produces ${Buffer.byteLength(body, "utf8")} bytes against a limit of ${MAX_SETUP_REQUEST_BYTES}`,
  );
});

test("returns a sign-in to the onboarding whatever the request asks for", async () => {
  // The destination is fixed here rather than read from the request, because a
  // redirect target taken from a request is one somebody else chose.
  for (const [asked, expected] of [
    ["onboarding", "/onboarding/"],
    [undefined, "/onboarding/"],
    ["https://example.invalid/", "/onboarding/"],
    ["../../etc", "/onboarding/"],
  ] as const) {
    const { handler, sessions } = harness();
    const browser = await createBrowserSession(handler);
    const query = asked === undefined ? "" : `?return=${encodeURIComponent(asked)}`;
    const start = await handler(
      new Request(`${origin}/api/auth/start${query}`, {
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
    const location = callback.headers.get("Location")!;
    assert.ok(
      location.endsWith(`${expected}?github=connected`),
      `asking for ${String(asked)} returned ${location}`,
    );
  }
});
