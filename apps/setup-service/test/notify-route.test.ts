import assert from "node:assert/strict";
import { test } from "bun:test";

import type { SetupServiceConfig } from "../src/config.js";
import { createSetupHandler } from "../src/handler.js";
import type { GitHubSetupClient } from "../src/github.js";
import type { AuditLogInput } from "../src/observability.js";
import type { NotifyRelay, NotifyResult } from "../src/notify.js";
import { createSessionStore } from "../src/session.js";
import { SetupServiceError } from "../src/setup-error.js";

/**
 * The route around the relay: what it accepts, what it refuses before the relay
 * is reached at all, and what reaches the log.
 *
 * The relay's own decisions are proved in `notify.test.ts` against real keys.
 * Here it is a stand-in, because what is under test is the boundary.
 */

const config = {
  environment: "test",
  publicOrigin: "https://setup.velvet.li",
  websiteOrigin: null,
  port: 3_000,
  secureCookies: true,
  github: {
    appId: "1",
    appSlug: "velvet-setup",
    clientId: "Iv1.client",
    clientSecret: "client-secret-value",
    privateKey: "unused-in-route-test",
  },
  sessionSecret: "s".repeat(32),
  automaticUpdateIntervalMs: 0,
  serialCounter: null,
  notify: null,
} satisfies SetupServiceConfig;

const github = {
  async exchangeOAuthCode() {
    return "user-token";
  },
} as unknown as GitHubSetupClient;

const IDENTITY_TOKEN = `Bearer ${"t".repeat(64)}`;
const GRANT = `${"p".repeat(24)}.${"s".repeat(43)}`;

function harness(notify?: NotifyRelay) {
  const lines: AuditLogInput[] = [];
  const handler = createSetupHandler({
    config,
    sessions: createSessionStore({ secret: config.sessionSecret }),
    github,
    logger: (line) => lines.push(line),
    requestId: () => "request".padEnd(20, "0"),
    errorId: () => "error".padEnd(20, "0"),
    ...(notify ? { notify } : {}),
  });
  return { handler, lines };
}

function alarm(headers: Record<string, string> = {}): Request {
  return new Request("https://setup.velvet.li/api/notify", {
    method: "POST",
    headers: {
      Authorization: IDENTITY_TOKEN,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ grant: GRANT, message: "Website is unavailable" }),
  });
}

/** A relay that always answers the same way, so the route is what is measured. */
function fixedRelay(result: NotifyResult): NotifyRelay {
  return { relay: async () => result };
}

test("says plainly that an instance forwards no alarms", async () => {
  // Its own code, because a service without a relay is not a failing service
  // and an operator reading their run should not go looking for a fault.
  const { handler } = harness();

  const response = await handler(alarm());
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "NOTIFY_UNAVAILABLE");
});

test("takes only POST", async () => {
  const { handler } = harness(
    fixedRelay({ outcome: "delivered", context: { repository: "example/status" } }),
  );

  const response = await handler(
    new Request("https://setup.velvet.li/api/notify", { method: "GET" }),
  );

  assert.equal(response.status, 405);
});

test("refuses an alarm carrying no proof of who sent it", async () => {
  const { handler } = harness(
    fixedRelay({ outcome: "delivered", context: { repository: "example/status" } }),
  );

  const response = await handler(
    new Request("https://setup.velvet.li/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant: GRANT, message: "Website is unavailable" }),
    }),
  );
  const body = (await response.json()) as { error: { code: string } };

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "NOTIFY_IDENTITY_REJECTED");
});

test("refuses a body that does not match the contract", async () => {
  const { handler } = harness(
    fixedRelay({ outcome: "delivered", context: { repository: "example/status" } }),
  );

  const response = await handler(
    new Request("https://setup.velvet.li/api/notify", {
      method: "POST",
      headers: {
        Authorization: IDENTITY_TOKEN,
        "Content-Type": "application/json",
      },
      // A bare Pushover key rather than a grant, which is exactly the shape the
      // relay must never accept.
      body: JSON.stringify({ userKey: "u".repeat(30), message: "down" }),
    }),
  );

  assert.equal(response.status, 400);
});

test("answers a delivered alarm with what it did, and logs who sent it", async () => {
  const { handler, lines } = harness(
    fixedRelay({
      outcome: "delivered",
      context: {
        repository: "example/status",
        repositoryId: 4_711,
        remaining: 8_640,
      },
    }),
  );

  const response = await handler(alarm());
  const body = (await response.json()) as { delivered: boolean };

  assert.equal(response.status, 202);
  assert.equal(body.delivered, true);

  const line = lines.find((entry) => entry.operation === "notify");
  assert.ok(line, "the relayed alarm is logged");
  assert.equal(line.outcome, "succeeded");
  assert.equal(line.context?.repository, "example/status");
  assert.equal(line.context?.remaining, 8_640);
});

test("keeps the recipient, the grant, and the alarm text out of the log", async () => {
  const { handler, lines } = harness(
    fixedRelay({
      outcome: "delivered",
      context: { repository: "example/status", repositoryId: 4_711 },
    }),
  );

  await handler(alarm());
  const written = JSON.stringify(lines);

  assert.equal(written.includes(GRANT), false);
  assert.equal(written.includes("Website is unavailable"), false);
  assert.equal(written.includes(IDENTITY_TOKEN), false);
});

test("passes a refusal through with its own code and an error id", async () => {
  const { handler, lines } = harness(
    fixedRelay({
      outcome: "refused",
      error: new SetupServiceError(
        "NOTIFY_ALLOWANCE_SPENT",
        "This installation has sent as many alarms as it may for now.",
        { status: 429, recoverable: true },
      ),
      context: { repository: "example/status", repositoryId: 4_711 },
      retryAfterSeconds: 3_600,
    }),
  );

  const response = await handler(alarm());
  const body = (await response.json()) as {
    error: { code: string; errorId: string };
  };

  assert.equal(response.status, 429);
  assert.equal(body.error.code, "NOTIFY_ALLOWANCE_SPENT");
  // Quotable, so an operator reading their run can point at the one line that
  // explains it.
  assert.equal(body.error.errorId.length >= 16, true);
  assert.equal(response.headers.get("Retry-After"), "3600");

  const line = lines.find((entry) => entry.operation === "notify");
  assert.equal(line?.outcome, "rejected");
  assert.equal(line?.code, "NOTIFY_ALLOWANCE_SPENT");
  assert.equal(line?.errorId, body.error.errorId);
});

test("needs no session, because the caller is a workflow rather than a browser", async () => {
  // No cookie, no CSRF token, and no Origin header, which every other mutating
  // route here requires and this one cannot have.
  const { handler } = harness(
    fixedRelay({
      outcome: "delivered",
      context: { repository: "example/status", repositoryId: 4_711 },
    }),
  );

  const response = await handler(alarm());

  assert.equal(response.status, 202);
});
