import assert from "node:assert/strict";
import { test } from "bun:test";

type FetchImplementation = (
  ...args: Parameters<typeof globalThis.fetch>
) => ReturnType<typeof globalThis.fetch>;

type GitHubIssue = {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  labels: string[];
};

type GitHubComment = {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
};

type GitHubIssuesClient = {
  listIssues: (label: string) => Promise<GitHubIssue[]>;
  listComments: (issueNumber: number) => Promise<GitHubComment[]>;
  ensureLabel: (input: {
    name: string;
    color: string;
    description: string;
  }) => Promise<void>;
  createIssue: (input: {
    title: string;
    body: string;
    labels: string[];
  }) => Promise<GitHubIssue>;
  updateIssue: (
    issueNumber: number,
    input: { title?: string; body?: string; state?: "open" | "closed" },
  ) => Promise<GitHubIssue>;
  createComment: (
    issueNumber: number,
    body: string,
  ) => Promise<GitHubComment>;
};

const githubModule = import("../src/index.js").catch(() => ({}));

async function createClient(
  fetch: FetchImplementation,
): Promise<GitHubIssuesClient> {
  const module = (await githubModule) as Record<string, unknown>;
  if (typeof module.createGitHubIssuesClient !== "function") {
    assert.fail(
      "@velvet/github-incidents must export createGitHubIssuesClient",
    );
  }
  return (
    module.createGitHubIssuesClient as (options: {
      owner: string;
      repo: string;
      token: string;
      apiBaseUrl: string;
      fetch: FetchImplementation;
      createErrorId: () => string;
    }) => GitHubIssuesClient
  )({
    owner: "example",
    repo: "status",
    token: "github-token",
    apiBaseUrl: "https://api.github.test",
    fetch,
    createErrorId: () => "error-test",
  });
}

function apiLabel(name = "incident") {
  return {
    id: 2_080_459_46,
    node_id: "MDU6TGFiZWwyMDgwNDU5NDY=",
    url: `https://api.github.test/repos/example/status/labels/${name}`,
    name,
    description: "Velvet incident",
    color: "d73a4a",
    default: false,
  };
}

function apiIssue(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 1,
    node_id: "I_kwDOExample",
    url: "https://api.github.test/repos/example/status/issues/12",
    repository_url: "https://api.github.test/repos/example/status",
    labels_url:
      "https://api.github.test/repos/example/status/issues/12/labels{/name}",
    comments_url:
      "https://api.github.test/repos/example/status/issues/12/comments",
    events_url:
      "https://api.github.test/repos/example/status/issues/12/events",
    html_url: "https://github.test/example/status/issues/12",
    number: 12,
    state: "open",
    state_reason: null,
    title: "Website is unavailable",
    body: "Incident details",
    user: { login: "github-actions[bot]", id: 41898282, type: "Bot" },
    labels: [apiLabel()],
    assignee: null,
    assignees: [],
    milestone: null,
    locked: false,
    active_lock_reason: null,
    comments: 0,
    closed_at: null,
    created_at: "2026-07-29T12:01:00Z",
    updated_at: "2026-07-29T12:01:00Z",
    closed_by: null,
    author_association: "NONE",
    ...overrides,
  };
}

function apiComment(body = "Recovered") {
  return {
    id: 100,
    node_id: "IC_kwDOExample",
    url: "https://api.github.test/repos/example/status/issues/comments/100",
    html_url: "https://github.test/example/status/issues/12#issuecomment-100",
    issue_url: "https://api.github.test/repos/example/status/issues/12",
    body,
    user: { login: "github-actions[bot]", id: 41898282, type: "Bot" },
    created_at: "2026-07-29T12:05:00Z",
    updated_at: "2026-07-29T12:05:00Z",
    author_association: "NONE",
    reactions: {
      url: "https://api.github.test/repos/example/status/issues/comments/100/reactions",
      total_count: 0,
      "+1": 0,
      "-1": 0,
      laugh: 0,
      hooray: 0,
      confused: 0,
      heart: 0,
      rocket: 0,
      eyes: 0,
    },
    performed_via_github_app: null,
  };
}

test("lists paginated issues with current version headers and filters pull requests", async () => {
  const requests: Request[] = [];
  const client = await createClient(async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const url = new URL(request.url);
    const page = url.searchParams.get("page");
    return Response.json(
      page === "2"
        ? [apiIssue({ number: 11, state: "closed", closed_at: "2026-07-29T12:04:00Z" })]
        : [
            apiIssue(),
            apiIssue({
              number: 99,
              pull_request: {
                url: "https://api.github.test/repos/example/status/pulls/99",
                html_url: "https://github.test/example/status/pull/99",
                diff_url: "https://github.test/example/status/pull/99.diff",
                patch_url: "https://github.test/example/status/pull/99.patch",
              },
            }),
          ],
      page === "2"
        ? undefined
        : {
            headers: {
              link: '<https://api.github.test/repos/example/status/issues?state=all&labels=incident&per_page=100&page=2>; rel="next"',
            },
          },
    );
  });

  const issues = await client.listIssues("incident");

  assert.deepEqual(
    issues.map(({ number, state, labels }) => ({ number, state, labels })),
    [
      { number: 12, state: "open", labels: ["incident"] },
      { number: 11, state: "closed", labels: ["incident"] },
    ],
  );
  assert.equal(issues[0]?.createdAt, "2026-07-29T12:01:00.000Z");
  assert.equal(issues[1]?.closedAt, "2026-07-29T12:04:00.000Z");
  assert.equal(requests[0]?.headers.get("authorization"), "Bearer github-token");
  assert.equal(requests[0]?.headers.get("cache-control"), "no-cache");
  assert.equal(
    requests[0]?.headers.get("x-github-api-version"),
    "2026-03-10",
  );
  assert.equal(new URL(requests[0]!.url).searchParams.get("state"), "all");
});

test("keeps an issue visible while GitHub's issue list catches up", async () => {
  const client = await createClient(async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST") {
      return Response.json(apiIssue(), { status: 201 });
    }
    return Response.json([]);
  });

  const created = await client.createIssue({
    title: "Website is unavailable",
    body: "Incident details",
    labels: ["incident"],
  });
  const listed = await client.listIssues("incident");

  assert.equal(created.number, 12);
  assert.deepEqual(listed.map(({ number }) => number), [12]);
});

test("creates a missing label but leaves an existing label unchanged", async () => {
  const methods: string[] = [];
  let labelExists = false;
  const client = await createClient(async (input, init) => {
    const request = new Request(input, init);
    methods.push(request.method);
    if (request.method === "GET" && !labelExists) {
      return new Response("not found", { status: 404 });
    }
    if (request.method === "POST") {
      assert.deepEqual(await request.json(), {
        name: "maintenance",
        color: "fbca04",
        description: "Velvet planned maintenance",
      });
      labelExists = true;
      return Response.json(apiLabel("maintenance"), { status: 201 });
    }
    return Response.json(apiLabel("maintenance"));
  });
  const input = {
    name: "maintenance",
    color: "fbca04",
    description: "Velvet planned maintenance",
  };

  await client.ensureLabel(input);
  await client.ensureLabel(input);

  assert.deepEqual(methods, ["GET", "POST", "GET"]);
});

test("creates and updates issues and creates and lists comments", async () => {
  const operations: Array<{ method: string; path: string; body: unknown }> = [];
  const client = await createClient(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const body = request.method === "GET" ? null : await request.json();
    operations.push({ method: request.method, path: url.pathname, body });

    if (request.method === "POST" && url.pathname.endsWith("/comments")) {
      return Response.json(apiComment((body as { body: string }).body), {
        status: 201,
      });
    }
    if (request.method === "GET" && url.pathname.endsWith("/comments")) {
      return Response.json([apiComment()]);
    }
    if (request.method === "PATCH") {
      const state = (body as { state?: "open" | "closed" }).state;
      return Response.json(
        apiIssue({
          state: state ?? "open",
          state_reason: state === "closed" ? "completed" : "reopened",
          closed_at: state === "closed" ? "2026-07-29T12:05:00Z" : null,
        }),
      );
    }
    return Response.json(apiIssue(), { status: 201 });
  });

  const created = await client.createIssue({
    title: "Website is unavailable",
    body: "Incident details",
    labels: ["incident"],
  });
  const comment = await client.createComment(12, "Recovered");
  const comments = await client.listComments(12);
  const closed = await client.updateIssue(12, { state: "closed" });
  const reopened = await client.updateIssue(12, { state: "open" });

  assert.equal(created.number, 12);
  assert.equal(comment.body, "Recovered");
  assert.deepEqual(comments.map(({ id }) => id), [100]);
  assert.equal(closed.state, "closed");
  assert.equal(reopened.state, "open");
  assert.deepEqual(operations, [
    {
      method: "POST",
      path: "/repos/example/status/issues",
      body: {
        title: "Website is unavailable",
        body: "Incident details",
        labels: ["incident"],
      },
    },
    {
      method: "POST",
      path: "/repos/example/status/issues/12/comments",
      body: { body: "Recovered" },
    },
    {
      method: "GET",
      path: "/repos/example/status/issues/12/comments",
      body: null,
    },
    {
      method: "PATCH",
      path: "/repos/example/status/issues/12",
      body: { state: "closed", state_reason: "completed" },
    },
    {
      method: "PATCH",
      path: "/repos/example/status/issues/12",
      body: { state: "open", state_reason: "reopened" },
    },
  ]);
});

test("reports disabled Issues, rate limits, transport failures, and malformed data", async () => {
  const disabled = await createClient(async () =>
    new Response("gone", { status: 410 }),
  );
  await assert.rejects(
    disabled.createIssue({ title: "Incident", body: "Body", labels: [] }),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "GITHUB_ISSUES_DISABLED" &&
      "errorId" in error &&
      error.errorId === "error-test",
  );

  const limited = await createClient(async () =>
    new Response("limited", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0" },
    }),
  );
  await assert.rejects(
    limited.listIssues("incident"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "GITHUB_RATE_LIMITED",
  );

  const unavailable = await createClient(async () => {
    throw new Error("network failed with github-token");
  });
  await assert.rejects(
    unavailable.listIssues("incident"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "GITHUB_REQUEST_FAILED" &&
      !error.message.includes("github-token"),
  );

  const malformed = await createClient(async () =>
    Response.json([{ number: "not-a-number" }]),
  );
  await assert.rejects(
    malformed.listIssues("incident"),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVALID_GITHUB_RESPONSE",
  );
});
