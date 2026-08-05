import assert from "node:assert/strict";
import { test } from "bun:test";

import { GitHubApiError } from "../src/github.js";
import { createGitHubRequest } from "../src/github-api.js";
import { createAuditLogger } from "../src/observability.js";
import { createRateLimiter } from "../src/rate-limit.js";
import { SetupServiceError } from "../src/setup-error.js";

test("writes structured request outcomes with a redacted upstream cause", () => {
  const lines: string[] = [];
  const logger = createAuditLogger({
    write: (line) => lines.push(line),
    now: () => "2026-07-30T12:00:00.000Z",
  });
  const cause = new GitHubApiError(
    new Response(null, {
      status: 403,
      headers: { "X-GitHub-Request-Id": "ABC:123", "Retry-After": "60" },
    }),
  );
  Object.assign(cause, { token: "secret-token" });

  logger({
    level: "error",
    requestId: "request-id",
    route: "/api/setup",
    operation: "provision",
    status: 503,
    outcome: "failed",
    code: "GITHUB_RATE_LIMITED",
    errorId: "error-id",
    cause,
  });

  assert.deepEqual(JSON.parse(lines[0]!), {
    timestamp: "2026-07-30T12:00:00.000Z",
    level: "error",
    requestId: "request-id",
    route: "/api/setup",
    operation: "provision",
    status: 503,
    outcome: "failed",
    code: "GITHUB_RATE_LIMITED",
    errorId: "error-id",
    cause: {
      name: "GitHubApiError",
      status: 403,
      githubRequestId: "ABC:123",
      retryAfterSeconds: 60,
    },
  });
  assert.doesNotMatch(lines[0]!, /secret-token|Authorization|client-secret/);
});

test("keeps safe GitHub diagnostics through a setup error wrapper", () => {
  const lines: string[] = [];
  const logger = createAuditLogger({ write: (line) => lines.push(line) });
  const upstream = new GitHubApiError(
    new Response(null, {
      status: 403,
      headers: { "X-GitHub-Request-Id": "DEF:456" },
    }),
  );
  Object.assign(upstream, { responseBody: "secret-token" });

  logger({
    level: "error",
    requestId: "request-id",
    route: "/api/setup",
    operation: "provision",
    status: 500,
    outcome: "failed",
    code: "GITHUB_API_FAILED",
    errorId: "error-id",
    cause: new SetupServiceError("GITHUB_API_FAILED", "Safe message.", {
      cause: upstream,
    }),
  });

  const cause = JSON.parse(lines[0]!).cause;
  assert.deepEqual(cause, {
    name: "SetupServiceError",
    cause: {
      name: "GitHubApiError",
      status: 403,
      githubRequestId: "DEF:456",
      retryAfterSeconds: null,
    },
  });
  assert.doesNotMatch(lines[0]!, /secret-token|responseBody/);
});

test("bounds rate-limit state and returns a retry delay", () => {
  let now = 0;
  const limiter = createRateLimiter({
    limit: 2,
    windowMs: 1_000,
    maxEntries: 2,
    now: () => now,
  });

  assert.equal(limiter.consume("one").allowed, true);
  assert.equal(limiter.consume("one").allowed, true);
  assert.deepEqual(limiter.consume("one"), {
    allowed: false,
    retryAfterSeconds: 1,
  });
  limiter.consume("two");
  limiter.consume("three");
  assert.equal(limiter.size(), 2);
  now = 1_001;
  assert.equal(limiter.consume("one").allowed, true);
});

test("keeps a stateless installation token out of the log", () => {
  // The shape GitHub is moving to: a `ghs_` prefix, two dots, around 520
  // characters. Redaction here keeps a fixed set of fields rather than matching
  // secrets by pattern, so a longer token cannot slip past a pattern that no
  // longer fits. This proves that rather than reasoning about it.
  const token = `ghs_${"A1b2C3d4_-".repeat(52).slice(0, 516)}`;
  const lines: string[] = [];
  const logger = createAuditLogger({
    write: (line) => lines.push(line),
    now: () => "2026-08-02T12:00:00.000Z",
  });
  const cause = new Error("Installation token rejected");
  Object.assign(cause, {
    token,
    headers: { Authorization: `Bearer ${token}` },
  });

  logger({
    level: "error",
    requestId: "request-id",
    route: "/api/setup",
    operation: "provision",
    status: 502,
    outcome: "failed",
    code: "GITHUB_API_FAILED",
    errorId: "error-id",
    cause,
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.includes(token), false, "the token itself never appears");
  assert.equal(lines[0]!.includes("ghs_"), false, "nor does its prefix");
  assert.equal(lines[0]!.includes("Bearer"), false, "nor the header carrying it");
  assert.equal(
    JSON.parse(lines[0]!).cause.name,
    "Error",
    "the cause is still reported, just without its payload",
  );
});

test("keeps GitHub's validation reasons and not the message beside them", async () => {
  // A 422 without them is a number: a name that is taken and a name that is
  // invalid arrive identically. The field and the code are GitHub's own
  // vocabulary, whilst the message can quote what was sent to it.
  const lines: string[] = [];
  const logger = createAuditLogger({ write: (line) => lines.push(line) });
  const githubRequest = createGitHubRequest(
    async () =>
      Response.json(
        {
          message: "Repository creation failed.",
          errors: [
            {
              resource: "Repository",
              code: "custom",
              field: "name",
              message: "secret-token already exists on this account",
            },
          ],
        },
        { status: 422 },
      ),
    "velvet-test",
  );

  let raised: unknown;
  try {
    await githubRequest("/user/repos", "secret-token", { method: "POST" });
  } catch (error) {
    raised = error;
  }

  logger({
    level: "error",
    requestId: "request-id",
    route: "/api/setup",
    operation: "provision",
    status: 409,
    outcome: "failed",
    code: "REPOSITORY_CONFLICT",
    errorId: "error-id",
    cause: raised,
  });

  assert.deepEqual(JSON.parse(lines[0]!).cause.githubReasons, ["name:custom"]);
  assert.doesNotMatch(lines[0]!, /secret-token|already exists/);
});
