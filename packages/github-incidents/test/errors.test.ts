import assert from "node:assert/strict";
import { test } from "bun:test";

const errorModule = import("../src/index.js").catch(() => ({}));

async function errorFunctions(): Promise<{
  GitHubIncidentsError: new (
    code: string,
    options?: { errorId?: string; status?: number; cause?: unknown },
  ) => Error & { code: string; errorId: string; status?: number };
  githubIncidentErrorLog: (
    operation: string,
    error: Error & { code: string; errorId: string; status?: number },
  ) => Record<string, unknown>;
}> {
  const module = (await errorModule) as Record<string, unknown>;
  if (typeof module.GitHubIncidentsError !== "function") {
    assert.fail("@velvet/github-incidents must export GitHubIncidentsError");
  }
  if (typeof module.githubIncidentErrorLog !== "function") {
    assert.fail("@velvet/github-incidents must export githubIncidentErrorLog");
  }
  return module as Awaited<ReturnType<typeof errorFunctions>>;
}

test("exposes stable safe GitHub errors with a unique error identifier", async () => {
  const { GitHubIncidentsError } = await errorFunctions();
  const error = new GitHubIncidentsError("GITHUB_RATE_LIMITED", {
    errorId: "error-123",
    status: 403,
    cause: new Error("token ghp_super_secret failed at /private/path"),
  });

  assert.equal(error.code, "GITHUB_RATE_LIMITED");
  assert.equal(error.errorId, "error-123");
  assert.equal(error.status, 403);
  assert.equal(error.message, "GitHub API rate limit reached");
  assert.equal(error.message.includes("ghp_super_secret"), false);
});

test("creates a structured redacted failure log", async () => {
  const { GitHubIncidentsError, githubIncidentErrorLog } =
    await errorFunctions();
  const error = new GitHubIncidentsError("GITHUB_REQUEST_FAILED", {
    errorId: "error-456",
    status: 502,
    cause: new Error("Authorization: Bearer ghp_super_secret"),
  });

  const record = githubIncidentErrorLog("list-issues", error);

  assert.deepEqual(record, {
    operation: "list-issues",
    result: "failed",
    code: "GITHUB_REQUEST_FAILED",
    errorId: "error-456",
    status: 502,
  });
  assert.equal(JSON.stringify(record).includes("ghp_super_secret"), false);
});
