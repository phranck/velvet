import assert from "node:assert/strict";
import { test } from "bun:test";

import type { GitHubInstallation, GitHubSetupClient } from "../src/github.js";
import {
  createUpdateAccess,
  UpdateAccessError,
  type ManageableRepository,
} from "../src/update-access.js";

const LOCK = {
  schemaVersion: 1,
  installedVersion: "2.0.0",
  template: {
    repository: "phranck/velvet",
    commit: "a".repeat(40),
  },
  configurationSchemaVersion: 1,
  dataSchemaVersion: 1,
};

const CONFIGURATION = `schemaVersion: 1
repository:
  owner: example
  name: status
statusPage:
  name: Example Status
  theme: velvet
services:
  - name: Website
    url: https://example.com
`;

function encoded(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function repositoryBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    name: "status",
    owner: { login: "example" },
    html_url: "https://github.com/example/status",
    default_branch: "main",
    permissions: { admin: true, push: true, pull: true },
    ...overrides,
  };
}

function githubClient(
  installations: GitHubInstallation[] = [
    {
      id: 7,
      accountLogin: "example",
      accountType: "User",
      repositorySelection: "selected",
    },
  ],
): GitHubSetupClient {
  return {
    async listInstallations() {
      return installations;
    },
  } as unknown as GitHubSetupClient;
}

interface FakeGitHub {
  access: ReturnType<typeof createUpdateAccess>;
  requests: { method: string; path: string; body: string | null }[];
}

/**
 * Serves the endpoints the access boundary reads, and records every call.
 *
 * Routes not registered answer 404, so a test proves what was asked for rather
 * than only what came back.
 */
function fakeGitHub(
  routes: Record<string, unknown>,
  client: GitHubSetupClient = githubClient(),
): FakeGitHub {
  const requests: FakeGitHub["requests"] = [];
  const access = createUpdateAccess({
    github: client,
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      requests.push({
        method: request.method,
        path,
        body: request.body ? await request.clone().text() : null,
      });
      const body = routes[`${request.method} ${path}`];
      return body === undefined
        ? new Response("{}", { status: 404 })
        : Response.json(body);
    },
  });
  return { access, requests };
}

const lockContents = {
  type: "file",
  encoding: "base64",
  size: JSON.stringify(LOCK).length,
  sha: "b".repeat(40),
  content: encoded(JSON.stringify(LOCK)),
};

test("lists the repositories an installation manages, with their versions", async () => {
  const { access, requests } = fakeGitHub({
    "GET /user/installations/7/repositories": {
      total_count: 2,
      repositories: [
        repositoryBody(),
        repositoryBody({ id: 10, name: "other", html_url: "https://github.com/example/other" }),
      ],
    },
    "GET /repos/example/status/contents/velvet.lock.json": lockContents,
  });

  const listed = await access.list("user-token");

  assert.equal(listed.truncated, false);
  assert.deepEqual(
    listed.repositories.map(({ name, installedVersion }) => ({
      name,
      installedVersion,
    })),
    [
      { name: "status", installedVersion: "2.0.0" },
      // No lock, so it is reported as present but unmanaged rather than hidden.
      { name: "other", installedVersion: null },
    ],
  );
  assert.equal(
    requests.some(({ path }) => path.includes("velvet.lock.json")),
    true,
  );
});

test("keeps a repository whose administration GitHub does not report", async () => {
  const { access } = fakeGitHub({
    "GET /user/installations/7/repositories": {
      total_count: 1,
      repositories: [repositoryBody({ permissions: undefined })],
    },
    "GET /repos/example/status/contents/velvet.lock.json": lockContents,
  });

  const listed = await access.list("user-token");

  assert.equal(listed.repositories.length, 1);
});

test("omits a repository the user cannot administer", async () => {
  const { access } = fakeGitHub({
    "GET /user/installations/7/repositories": {
      total_count: 1,
      repositories: [
        repositoryBody({ permissions: { admin: false, push: true, pull: true } }),
      ],
    },
  });

  assert.deepEqual((await access.list("user-token")).repositories, []);
});

test("authorizes a repository the user administers through their installation", async () => {
  const { access } = fakeGitHub({
    "GET /repositories/9": repositoryBody(),
    "GET /repos/example/status/contents/velvet.lock.json": lockContents,
  });

  const repository = await access.authorize("user-token", 7, 9);

  assert.deepEqual(repository, {
    installationId: 7,
    repositoryId: 9,
    owner: "example",
    name: "status",
    htmlUrl: "https://github.com/example/status",
    defaultBranch: "main",
    installedVersion: "2.0.0",
  } satisfies ManageableRepository);
});

test("refuses an installation the user does not hold", async () => {
  const { access, requests } = fakeGitHub({ "GET /repositories/9": repositoryBody() });

  await assert.rejects(
    access.authorize("user-token", 8, 9),
    UpdateAccessError,
  );
  assert.deepEqual(requests, [], "the repository is never even looked up");
});

test("refuses a repository owned by someone other than the installation", async () => {
  const { access } = fakeGitHub({
    "GET /repositories/9": repositoryBody({ owner: { login: "someone-else" } }),
  });

  await assert.rejects(access.authorize("user-token", 7, 9), UpdateAccessError);
});

test("refuses a repository the user does not administer", async () => {
  const { access } = fakeGitHub({
    "GET /repositories/9": repositoryBody({
      permissions: { admin: false, push: true, pull: true },
    }),
  });

  await assert.rejects(access.authorize("user-token", 7, 9), UpdateAccessError);
});

test("refuses a repository GitHub will not show the user", async () => {
  const { access } = fakeGitHub({});

  await assert.rejects(access.authorize("user-token", 7, 9), UpdateAccessError);
});

test("writes a configuration against the blob it was read from", async () => {
  const { access, requests } = fakeGitHub({
    "GET /repos/example/status/contents/velvet.yml": {
      type: "file",
      encoding: "base64",
      sha: "c".repeat(40),
      content: encoded(CONFIGURATION),
    },
    "PUT /repos/example/status/contents/velvet.yml": {
      content: {},
      commit: { sha: "d".repeat(40) },
    },
  });
  const repository: ManageableRepository = {
    installationId: 7,
    repositoryId: 9,
    owner: "example",
    name: "status",
    htmlUrl: "https://github.com/example/status",
    defaultBranch: "main",
    installedVersion: "2.0.0",
  };

  const read = await access.readConfiguration("user-token", repository);
  assert.equal(read.source, CONFIGURATION);

  await access.writeConfiguration(
    "user-token",
    repository,
    `${CONFIGURATION}updates:\n  automaticSecurityUpdates: false\n`,
    read.blobSha,
    "Update Velvet update preferences",
  );

  const write = requests.find(({ method }) => method === "PUT");
  const body = JSON.parse(write!.body!) as Record<string, unknown>;
  assert.equal(body.sha, "c".repeat(40));
  assert.equal(body.branch, "main");
  assert.match(
    Buffer.from(body.content as string, "base64").toString("utf8"),
    /automaticSecurityUpdates: false/u,
  );
});
