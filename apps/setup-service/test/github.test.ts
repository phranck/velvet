import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { spyOn, test } from "bun:test";

import {
  GITHUB_API_VERSION,
  GitHubApiError,
  createGitHubAppJwt,
  createGitHubSetupClient,
} from "../src/github.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2_048,
});
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

test("signs a short-lived RS256 GitHub App JWT", () => {
  const token = createGitHubAppJwt("12345", privateKeyPem, () => 1_000_000);
  const [header, payload, signature] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header!, "base64url").toString()), {
    alg: "RS256",
    typ: "JWT",
  });
  assert.deepEqual(JSON.parse(Buffer.from(payload!, "base64url").toString()), {
    iat: 999_940,
    exp: 1_000_540,
    iss: "12345",
  });
  assert.equal(
    verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature!, "base64url"),
    ),
    true,
  );
});

test("uses PKCE for OAuth exchange and never puts the client secret in the URL", async () => {
  const requests: Request[] = [];
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    fetch: async (request) => {
      requests.push(request);
      return Response.json({ access_token: "user-token", token_type: "bearer" });
    },
  });

  assert.equal(await client.exchangeOAuthCode("oauth-code", "verifier"), "user-token");
  const request = requests[0]!;
  assert.equal(request.url, "https://github.com/login/oauth/access_token");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("Accept"), "application/json");
  assert.deepEqual(await request.json(), {
    client_id: "Iv1.client",
    client_secret: "client-secret",
    code: "oauth-code",
    code_verifier: "verifier",
  });
});

test("restricts installation tokens and repository changes to the Velvet setup flow", async () => {
  const requests: Request[] = [];
  const responses = [
    { token: "installation-token", expires_at: "2026-07-30T12:00:00Z" },
    {
      id: 99,
      name: "status",
      html_url: "https://github.com/example/status",
      default_branch: "main",
      owner: { login: "example", id: 255_022_500 },
    },
    { sha: "template-sha" },
    { content: { sha: "commit-sha" } },
    { html_url: "https://example.github.io/status/", status: "built" },
    {
      workflow_run_id: 777,
      run_url: "https://api.github.com/repos/example/status/actions/runs/777",
      html_url: "https://github.com/example/status/actions/runs/777",
    },
    {
      total_count: 3,
      jobs: [
        {
          id: 1,
          name: "Check services and publish initial data",
          status: "completed",
          conclusion: "success",
        },
        {
          id: 2,
          name: "Build status page",
          status: "in_progress",
          conclusion: null,
        },
        {
          id: 3,
          name: "Deploy to GitHub Pages",
          status: "queued",
          conclusion: null,
        },
      ],
    },
  ];
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    nowSeconds: () => 1_000_000,
    fetch: async (request) => {
      requests.push(request);
      return Response.json(responses.shift(), { status: 200 });
    },
  });

  assert.equal(await client.createInstallationToken(7, 99), "installation-token");
  const repository = await client.createRepository(
    "user-token",
    "example",
    "status",
    "private",
    true,
  );
  assert.equal(repository.id, 99);
  assert.equal(repository.ownerId, 255_022_500);
  assert.equal(await client.getConfigurationSha("installation-token", "example", "status"), "template-sha");
  await client.writeConfiguration(
    "installation-token",
    "example",
    "status",
    "schemaVersion: 1\n",
    "template-sha",
  );
  await client.enablePages("installation-token", "example", "status");
  assert.equal(
    await client.dispatchWorkflow("installation-token", "example", "status"),
    777,
  );
  assert.deepEqual(
    await client.workflowJobs("installation-token", "example", "status", 777),
    [
      {
        name: "Check services and publish initial data",
        status: "completed",
        conclusion: "success",
      },
      { name: "Build status page", status: "in_progress", conclusion: null },
      { name: "Deploy to GitHub Pages", status: "queued", conclusion: null },
    ],
  );

  assert.deepEqual(await requests[0]!.json(), {
    repository_ids: [99],
    permissions: {
      actions: "write",
      administration: "write",
      contents: "write",
      pages: "write",
      workflows: "write",
    },
  });
  assert.equal(
    requests[1]!.url,
    "https://api.github.com/user/repos",
  );
  // Asked for privately above, and asked of GitHub privately here. The choice
  // reaches the request rather than being decided in the service.
  //
  // `auto_init` is what gives the new repository a default branch, which the
  // write that follows needs a parent on. Every feature is stated rather than
  // left to a default, so the repository offers what Velvet uses and nothing
  // else: Issues because incidents and maintenance are Issues, and squash
  // because that is how an update pull request is merged.
  assert.deepEqual(await requests[1]!.json(), {
    name: "status",
    private: true,
    auto_init: true,
    has_issues: true,
    has_wiki: false,
    has_projects: false,
    has_downloads: false,
    allow_squash_merge: true,
    allow_merge_commit: false,
    allow_rebase_merge: false,
    delete_branch_on_merge: true,
  });
  assert.equal(
    requests[2]!.url,
    "https://api.github.com/repos/example/status/contents/velvet.yml",
  );
  assert.deepEqual(await requests[3]!.json(), {
    message: "Configure Velvet [skip ci]",
    content: Buffer.from("schemaVersion: 1\n").toString("base64"),
    sha: "template-sha",
    branch: "main",
  });
  assert.deepEqual(await requests[4]!.json(), { build_type: "workflow" });
  assert.equal(
    requests[5]!.url,
    "https://api.github.com/repos/example/status/actions/workflows/velvet.yml/dispatches",
  );
  assert.deepEqual(await requests[5]!.json(), { ref: "main" });
  assert.equal(
    requests[6]!.url,
    "https://api.github.com/repos/example/status/actions/runs/777/jobs?filter=latest&per_page=100",
  );

  for (const request of requests.slice(0, 1).concat(requests.slice(1))) {
    if (request.url.startsWith("https://api.github.com/")) {
      assert.equal(request.headers.get("X-GitHub-Api-Version"), GITHUB_API_VERSION);
    }
  }
});

test("sets a Pages custom domain without checking DNS propagation", async () => {
  const requests: Request[] = [];
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    fetch: async (request) => {
      requests.push(request);
      return new Response(null, { status: 204 });
    },
  });
  await client.configurePagesCustomDomain(
    "installation-token",
    "example",
    "status",
    "status.example.com",
  );

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    "https://api.github.com/repos/example/status/pages",
  );
  assert.equal(requests[0]?.method, "PUT");
  assert.deepEqual(await requests[0]!.json(), { cname: "status.example.com" });
  assert.equal(requests.some((request) => request.url.endsWith("/pages/health")), false);
});

test("resolves installation targets and removes temporary installations with an app JWT", async () => {
  const requests: Request[] = [];
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    nowSeconds: () => 1_000_000,
    fetch: async (request) => {
      requests.push(request);
      if (request.method === "DELETE") return new Response(null, { status: 202 });
      return Response.json({ id: 255_022_500, login: "example", type: "User" });
    },
  });

  assert.deepEqual(await client.account("user-token", "example"), {
    id: 255_022_500,
    login: "example",
    type: "User",
  });
  await client.deleteInstallation(7);

  assert.equal(requests[0]?.url, "https://api.github.com/users/example");
  assert.equal(requests[0]?.headers.get("Authorization"), "Bearer user-token");
  assert.equal(requests[1]?.url, "https://api.github.com/app/installations/7");
  assert.equal(requests[1]?.method, "DELETE");
  assert.match(requests[1]?.headers.get("Authorization") ?? "", /^Bearer [^.]+\.[^.]+\.[^.]+$/);
});

test("accepts a newly requested workflow run as still in progress", async () => {
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    fetch: async () => Response.json({
      id: 777,
      status: "requested",
      conclusion: null,
      html_url: "https://github.com/example/status/actions/runs/777",
    }),
  });

  assert.equal(
    (await client.workflowRun("installation-token", "example", "status", 777)).status,
    "requested",
  );
});

test("creates the configuration where the repository holds none", async () => {
  // What a first setup meets: Velvet creates the repository with a README and
  // nothing else, so there is no blob to replace and GitHub refuses a SHA that
  // names a file which does not exist.
  const requests: Request[] = [];
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    fetch: async (request) => {
      requests.push(request.clone());
      if (request.method === "GET") {
        return Response.json({ message: "Not Found" }, { status: 404 });
      }
      return Response.json({ content: { sha: "written-sha" } });
    },
  });

  assert.equal(
    await client.getConfigurationSha("installation-token", "example", "status"),
    null,
    "a missing configuration is an answer rather than a failure",
  );
  await client.writeConfiguration(
    "installation-token",
    "example",
    "status",
    "schemaVersion: 1\n",
    null,
  );

  assert.deepEqual(await requests[1]!.json(), {
    message: "Configure Velvet [skip ci]",
    content: Buffer.from("schemaVersion: 1\n").toString("base64"),
    branch: "main",
  });
});

test("reports whether the installation token can read the repository yet", async () => {
  let answered = 0;
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    fetch: async () => {
      answered += 1;
      return answered === 1
        ? Response.json({ message: "Not Found" }, { status: 404 })
        : Response.json({ id: 99, name: "status", owner: { login: "example", id: 7 } });
    },
  });

  assert.equal(
    await client.repositoryReadable("installation-token", "example", "status"),
    false,
    "GitHub has not granted the access yet",
  );
  assert.equal(
    await client.repositoryReadable("installation-token", "example", "status"),
    true,
  );
});

test("returns bounded GitHub errors without response bodies or credentials", async () => {
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    fetch: async () =>
      Response.json(
        { message: "secret-token leaked by upstream" },
        {
          status: 403,
          headers: { "X-GitHub-Request-Id": "ABC:123", "Retry-After": "60" },
        },
      ),
  });

  await assert.rejects(
    () => client.viewer("secret-token"),
    (error: unknown) => {
      assert.equal(error instanceof GitHubApiError, true);
      assert.equal((error as Error).message, "GitHub API request failed.");
      assert.equal((error as GitHubApiError).status, 403);
      assert.equal((error as GitHubApiError).requestId, "ABC:123");
      assert.equal((error as GitHubApiError).retryAfterSeconds, 60);
      assert.doesNotMatch(JSON.stringify(error), /secret-token/);
      return true;
    },
  );
});

test("pushes the managed files again when GitHub still serves the previous head", async () => {
  // Observed in production: writing the configuration and then immediately
  // reading `refs/heads/main` can return the head from before that commit.
  // The managed-file commit then hangs off a parent that is already behind,
  // the non-forced push is not a fast-forward, and GitHub answers 422. The
  // repository was left with a configuration and no version lock, which is an
  // installation nothing can ever update.
  const heads = ["a".repeat(40), "b".repeat(40)];
  let refReads = 0;
  let pushes = 0;
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret-value",
    privateKey: privateKeyPem,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/git/ref/heads/main")) {
        const head = heads[Math.min(refReads, heads.length - 1)]!;
        refReads += 1;
        return Response.json({ object: { sha: head } });
      }
      if (url.pathname.includes("/git/commits/")) {
        return Response.json({ tree: { sha: "c".repeat(40) } });
      }
      if (url.pathname.endsWith("/git/trees")) {
        return Response.json({ sha: "d".repeat(40) });
      }
      if (url.pathname.endsWith("/git/commits")) {
        return Response.json({ sha: "e".repeat(40) });
      }
      if (url.pathname.endsWith("/git/refs/heads/main")) {
        pushes += 1;
        return pushes === 1
          ? new Response("{}", { status: 422 })
          : Response.json({ object: { sha: "e".repeat(40) } });
      }
      throw new Error(`Unexpected request ${url.pathname}`);
    },
  });

  await client.writeManagedFiles("installation-token", "example", "status", [
    { path: "velvet.lock.json", content: "{}\n" },
  ]);

  assert.equal(pushes, 2, "the refused push is retried");
  assert.equal(refReads, 2, "each attempt reads the head again");
});

test("gives up on a push GitHub keeps refusing", async () => {
  let pushes = 0;
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret-value",
    privateKey: privateKeyPem,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/git/ref/heads/main")) {
        return Response.json({ object: { sha: "a".repeat(40) } });
      }
      if (url.pathname.includes("/git/commits/")) {
        return Response.json({ tree: { sha: "c".repeat(40) } });
      }
      if (url.pathname.endsWith("/git/trees")) {
        return Response.json({ sha: "d".repeat(40) });
      }
      if (url.pathname.endsWith("/git/commits")) {
        return Response.json({ sha: "e".repeat(40) });
      }
      pushes += 1;
      return new Response("{}", { status: 422 });
    },
  });

  await assert.rejects(
    () =>
      client.writeManagedFiles("installation-token", "example", "status", [
        { path: "velvet.lock.json", content: "{}\n" },
      ]),
    GitHubApiError,
  );
  assert.equal(pushes, 6, "a genuine conflict still fails");
});

/**
 * An installation token in the stateless format GitHub is moving to: a `ghs_`
 * prefix, JWT-shaped with two dots, and around 520 characters. Built rather
 * than pasted, so the length is stated where it can be read.
 */
function statelessInstallationToken(): string {
  const segment = (length: number): string => "A1b2C3d4_-".repeat(length).slice(0, length);
  const token = `ghs_${segment(180)}.${segment(180)}.${segment(154)}`;
  assert.equal(token.length, 520);
  assert.equal(token.split(".").length, 3);
  return token;
}

test("carries a stateless installation token through unchanged", async () => {
  const token = statelessInstallationToken();
  const requests: Request[] = [];
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    nowSeconds: () => 1_000_000,
    fetch: async (request) => {
      requests.push(request);
      return Response.json(
        { token, permissions: { workflows: "write" } },
        { status: 200 },
      );
    },
  });

  const issued = await client.createInstallationToken(7, 99);

  assert.equal(issued, token, "nothing truncates or rewrites a token this long");
  assert.equal(requests.length, 1);
});

test("sends a stateless token whole in the Authorization header", async () => {
  const token = statelessInstallationToken();
  const seen: string[] = [];
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    nowSeconds: () => 1_000_000,
    fetch: async (request) => {
      seen.push(request.headers.get("Authorization") ?? "");
      return Response.json({ sha: "configuration-sha" }, { status: 200 });
    },
  });

  await client.getConfigurationSha(token, "example", "status");

  assert.equal(seen[0], `Bearer ${token}`);
});

test("asks once for the token setup needs and does not settle for less", async () => {
  // GitHub refuses a token asking for more than the App was granted. Minting a
  // lesser one instead left a repository with a configuration and a version
  // lock, no workflows, and therefore nothing that monitors or publishes.
  const requests: Request[] = [];
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    fetch: async (request) => {
      requests.push(request.clone());
      return Response.json(
        { message: "Not accessible by integration" },
        { status: 422 },
      );
    },
  });

  await assert.rejects(
    () => client.createInstallationToken(7, 99),
    (error: unknown) =>
      error instanceof GitHubApiError && error.status === 422,
  );
  assert.equal(requests.length, 1, "one attempt, not a second with less");
  assert.deepEqual((await requests[0]!.json()).permissions, {
    actions: "write",
    administration: "write",
    contents: "write",
    pages: "write",
    workflows: "write",
  });
});

test("creates a public repository when the request asks for one", async () => {
  // The default every installation made before the choice existed received,
  // and what the onboarding sends when the box is left unchecked.
  const requests: Request[] = [];
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    fetch: async (request) => {
      requests.push(request.clone());
      return Response.json({
        id: 99,
        name: "status",
        html_url: "https://github.com/example/status",
        default_branch: "main",
        owner: { login: "example", id: 7 },
      });
    },
  });

  await client.createRepository("user-token", "example", "status", "public", true);

  assert.equal((await requests[0]!.json()).private, false);
});

/**
 * Drives a dispatch against a sequence of replies, without waiting for real
 * delays.
 *
 * The retry sleeps for a second and a half between attempts, which a test
 * cannot spend, so the sleep is recorded rather than served.
 *
 * @param reply - Answers the nth dispatch request, counted from one.
 * @returns What the dispatch returned or threw, the number of requests it made,
 *   and the delays it asked for.
 */
async function dispatchAgainst(reply: (attempt: number) => Response): Promise<{
  outcome: number | unknown;
  attempts: number;
  delays: number[];
}> {
  const delays: number[] = [];
  const sleep = spyOn(Bun, "sleep").mockImplementation(
    async (ms: number | Date) => {
      // The retry asks in milliseconds. A Date would leave the count short and
      // fail the assertion below rather than being recorded as something else.
      if (typeof ms === "number") delays.push(ms);
    },
  );
  let attempts = 0;
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret",
    privateKey: privateKeyPem,
    fetch: async () => {
      attempts += 1;
      return reply(attempts);
    },
  });
  try {
    const outcome = await client
      .dispatchWorkflow("installation-token", "example", "status")
      .catch((error: unknown) => error);
    return { outcome, attempts, delays };
  } finally {
    sleep.mockRestore();
  }
}

test("retries a workflow dispatch GitHub has not registered yet", async () => {
  // GitHub indexes a workflow file asynchronously after the push that wrote it,
  // so the first dispatches answer 404 for a file the setup has just written.
  const { outcome, attempts, delays } = await dispatchAgainst((attempt) =>
    attempt < 3
      ? Response.json({ message: "Not Found" }, { status: 404 })
      : Response.json({ workflow_run_id: 777 }),
  );

  assert.equal(outcome, 777);
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [1_500, 1_500]);
});

test("does not retry a dispatch refused for a reason that will not change", async () => {
  const { outcome, attempts, delays } = await dispatchAgainst(() =>
    Response.json({ message: "Forbidden" }, { status: 403 }),
  );

  assert.equal(
    outcome instanceof GitHubApiError && outcome.status,
    403,
    "a permission failure is reported rather than retried",
  );
  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});

test("gives up on a dispatch that answers 404 indefinitely", async () => {
  const { outcome, attempts, delays } = await dispatchAgainst(() =>
    Response.json({ message: "Not Found" }, { status: 404 }),
  );

  assert.equal(outcome instanceof GitHubApiError && outcome.status, 404);
  assert.equal(attempts, 10, "the ceiling holds");
  assert.equal(delays.length, 9);
});

test("holds the build back, except for the commit that records the serial", async () => {
  // Everything written during a setup goes in before the page has ever been
  // built, so a commit that started a build would start one that is thrown
  // away. The serial is the one exception: it is issued once the page is
  // already published, and a page cannot show a number that reached its
  // repository behind a commit nothing reacts to.
  const messages: string[] = [];
  const client = createGitHubSetupClient({
    appId: "12345",
    clientId: "Iv1.client",
    clientSecret: "client-secret-value",
    privateKey: privateKeyPem,
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/access_tokens")) {
        return Response.json({ token: "installation-token" });
      }
      if (url.pathname.endsWith("/git/blobs")) {
        return Response.json({ sha: "a".repeat(40) });
      }
      if (url.pathname.endsWith("/git/ref/heads/main")) {
        return Response.json({ object: { sha: "b".repeat(40) } });
      }
      if (url.pathname.includes("/git/commits/")) {
        return Response.json({ tree: { sha: "c".repeat(40) } });
      }
      if (url.pathname.endsWith("/git/trees")) {
        return Response.json({ sha: "d".repeat(40) });
      }
      if (url.pathname.endsWith("/git/commits")) {
        const body = (await request.json()) as { message: string };
        messages.push(body.message);
        return Response.json({ sha: "e".repeat(40) });
      }
      if (url.pathname.endsWith("/git/refs/heads/main")) {
        return Response.json({ object: { sha: "e".repeat(40) } });
      }
      throw new Error(`Unexpected request ${url.pathname}`);
    },
  });

  const files = [{ path: "velvet.lock.json", content: "{}\n" }];
  await client.writeManagedFiles("installation-token", "example", "status", files);
  await client.writeManagedFiles("installation-token", "example", "status", files, true);

  assert.match(messages[0]!, /\[skip ci\]/u);
  assert.doesNotMatch(
    messages[1]!,
    /skip ci/u,
    "the serial has to reach the page, not only the repository",
  );
});
