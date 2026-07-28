import assert from "node:assert/strict";
import test from "node:test";

import * as adapter from "../src/index.js";

function contentResponse(content: string): Response {
  return Response.json({
    content: Buffer.from(content).toString("base64"),
    encoding: "base64",
  });
}

test("loads paginated commits and issues from the GitHub API", async () => {
  const mockFetch: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());

    if (url.pathname.endsWith("/.upptimerc.yml")) {
      return contentResponse("sites:\n  - name: Website\n    url: https://example.invalid\n");
    }
    if (url.pathname.endsWith("/history/summary.json")) {
      return contentResponse(
        JSON.stringify([
          {
            name: "Website",
            slug: "website",
            status: "up",
            time: 100,
            dailyMinutesDown: {},
          },
        ]),
      );
    }
    if (url.pathname.endsWith("/history/website.yml")) {
      return contentResponse(
        "status: up\nlastUpdated: 2026-07-06T12:00:00.000Z\nstartTime: 2026-07-05T10:00:00.000Z\n",
      );
    }
    if (url.pathname.endsWith("/commits")) {
      const page = url.searchParams.get("page");
      return Response.json(
        [
          {
            sha: page === "2" ? "older" : "newer",
            commit: {
              message: `Website is up (200 in ${page === "2" ? 90 : 100} ms) [upptime]`,
              committer: {
                date:
                  page === "2"
                    ? "2026-07-05T12:00:00Z"
                    : "2026-07-06T12:00:00Z",
              },
            },
          },
        ],
        page === "2"
          ? undefined
          : {
              headers: {
                link: `<https://api.github.test/repos/example/status/commits?path=history%2Fwebsite.yml&per_page=100&page=2>; rel="next"`,
              },
            },
      );
    }
    if (url.pathname.endsWith("/issues")) {
      const page = url.searchParams.get("page");
      return Response.json(
        [
          {
            number: page === "2" ? 1 : 2,
            title: "Website is down",
            body: "",
            state: "closed",
            created_at: "2026-07-05T11:00:00Z",
            closed_at: "2026-07-05T11:30:00Z",
            labels: [{ name: "status" }, { name: "website" }],
          },
        ],
        page === "2"
          ? undefined
          : {
              headers: {
                link: `<https://api.github.test/repos/example/status/issues?state=all&per_page=100&page=2>; rel="next"`,
              },
            },
      );
    }

    return new Response("not found", { status: 404 });
  };

  const snapshot = await adapter.loadUpptimeSnapshot({
    owner: "example",
    repo: "status",
    apiBaseUrl: "https://api.github.test",
    fetch: mockFetch,
  });

  assert.deepEqual(
    snapshot.commits.website?.map(({ sha }) => sha),
    ["newer", "older"],
  );
  assert.equal(
    snapshot.commits.website?.[0]?.committedAt,
    "2026-07-06T12:00:00.000Z",
  );
  assert.deepEqual(
    snapshot.issues.map(({ number }) => number),
    [2, 1],
  );
  assert.equal(snapshot.issues[0]?.createdAt, "2026-07-05T11:00:00.000Z");
  assert.equal(snapshot.issues[0]?.closedAt, "2026-07-05T11:30:00.000Z");
});

test("reports GitHub rate limits with a stable error code", async () => {
  const rateLimitedFetch: typeof fetch = async () =>
    new Response("rate limited", {
      status: 403,
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1785142800",
      },
    });

  await assert.rejects(
    adapter.loadUpptimeSnapshot({
      owner: "example",
      repo: "status",
      fetch: rateLimitedFetch,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "GITHUB_RATE_LIMITED",
  );
});

test("reports GitHub transport failures with a stable error code", async () => {
  const failedFetch: typeof fetch = async () => {
    throw new Error("network unavailable");
  };

  await assert.rejects(
    adapter.loadUpptimeSnapshot({
      owner: "example",
      repo: "status",
      fetch: failedFetch,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "GITHUB_REQUEST_FAILED",
  );
});

test("reports malformed GitHub payloads as partial upstream data", async () => {
  const malformedFetch: typeof fetch = async () =>
    new Response("not json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  await assert.rejects(
    adapter.loadUpptimeSnapshot({
      owner: "example",
      repo: "status",
      fetch: malformedFetch,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "PARTIAL_UPSTREAM_DATA",
  );
});

test("reports a missing history file with a stable error code", async () => {
  const missingHistoryFetch: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.endsWith("/.upptimerc.yml")) {
      return contentResponse("sites:\n  - name: Website\n    url: https://example.invalid\n");
    }
    if (url.pathname.endsWith("/history/summary.json")) {
      return contentResponse(
        JSON.stringify([
          {
            name: "Website",
            slug: "website",
            status: "up",
            time: 100,
            dailyMinutesDown: {},
          },
        ]),
      );
    }
    return new Response("not found", { status: 404 });
  };

  await assert.rejects(
    adapter.loadUpptimeSnapshot({
      owner: "example",
      repo: "status",
      fetch: missingHistoryFetch,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "MISSING_HISTORY",
  );
});

test("loads a fresh repository without a history directory", async () => {
  const freshRepositoryFetch: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.endsWith("/.upptimerc.yml")) {
      return contentResponse("sites:\n  - name: Website\n    url: https://example.invalid\n");
    }
    if (url.pathname.endsWith("/issues")) {
      return Response.json([]);
    }
    return new Response("not found", { status: 404 });
  };

  const snapshot = await adapter.loadUpptimeSnapshot({
    owner: "example",
    repo: "status",
    fetch: freshRepositoryFetch,
  });

  assert.equal(snapshot.historyState, "absent");
  assert.deepEqual(snapshot.histories, {});
  assert.deepEqual(snapshot.commits, {});
});

test("rejects a missing summary inside an existing history directory", async () => {
  const partialHistoryFetch: typeof fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname.endsWith("/.upptimerc.yml")) {
      return contentResponse("sites:\n  - name: Website\n    url: https://example.invalid\n");
    }
    if (url.pathname.endsWith("/history")) {
      return Response.json([]);
    }
    return new Response("not found", { status: 404 });
  };

  await assert.rejects(
    adapter.loadUpptimeSnapshot({
      owner: "example",
      repo: "status",
      fetch: partialHistoryFetch,
    }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "PARTIAL_UPSTREAM_DATA",
  );
});
