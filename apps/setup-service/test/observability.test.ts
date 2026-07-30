import assert from "node:assert/strict";
import { test } from "bun:test";

import { GitHubApiError } from "../src/github.js";
import { createAuditLogger } from "../src/observability.js";
import { createRateLimiter } from "../src/rate-limit.js";

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
