import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  ConfiguratorError,
  createConfiguratorClient,
} from "../src/configurator/client.js";

const SIGNED_IN = {
  authenticated: true,
  csrfToken: "C".repeat(43),
  user: {
    login: "velvet-user",
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
  },
};

const INSTALLATION = {
  installationId: 7,
  repositoryId: 9,
  owner: "velvet-user",
  name: "status",
  htmlUrl: "https://github.com/velvet-user/status",
  installedVersion: "1.9.0",
};

/**
 * Answers both requests the client makes, recording what it asked for.
 *
 * @param listing - The body `/api/installations` answers with, or a Response
 *   when the test is about the status rather than the body.
 */
function harness(listing: unknown, session: unknown = SIGNED_IN) {
  const asked: string[] = [];
  const wentTo: string[] = [];
  const client = createConfiguratorClient(
    async (url) => {
      asked.push(String(url));
      if (String(url) === "/api/session") return Response.json(session);
      return listing instanceof Response
        ? listing.clone()
        : Response.json(listing);
    },
    (url) => wentTo.push(url),
  );
  return { asked, wentTo, client };
}

test("reads who is signed in and what they may configure", async () => {
  const { asked, wentTo, client } = harness({
    repositories: [INSTALLATION],
    truncated: false,
  });

  const opening = await client.open();

  assert.deepEqual(asked, ["/api/session", "/api/installations"]);
  assert.deepEqual(wentTo, [], "a signed-in visitor stays where they are");
  assert.equal(opening.login, "velvet-user");
  assert.equal(opening.installations.length, 1);
  assert.equal(opening.installations[0]?.owner, "velvet-user");
  assert.equal(opening.truncated, false);
});

test("drops a repository that carries no Velvet installation", async () => {
  const { client } = harness({
    repositories: [
      INSTALLATION,
      { ...INSTALLATION, repositoryId: 10, name: "notes", installedVersion: null },
    ],
    truncated: false,
  });

  const opening = await client.open();

  assert.deepEqual(
    opening.installations.map((installation) => installation.name),
    ["status"],
    "access to a repository is not an installation in it",
  );
});

test("carries a truncated listing through rather than swallowing it", async () => {
  const { client } = harness({
    repositories: [INSTALLATION],
    truncated: true,
  });

  assert.equal((await client.open()).truncated, true);
});

test("leaves for the authorization when nobody is signed in", async () => {
  const { asked, wentTo, client } = harness(
    { repositories: [], truncated: false },
    { authenticated: false },
  );

  await client.open();

  assert.deepEqual(wentTo, ["/api/auth/start"]);
  assert.deepEqual(
    asked,
    ["/api/session"],
    "nothing is asked of the service on behalf of nobody",
  );
});

test("leaves for the authorization when the session expires mid-flight", async () => {
  const { wentTo, client } = harness(new Response(null, { status: 401 }));

  await client.open();

  assert.deepEqual(wentTo, ["/api/auth/start"]);
});

test("refuses a listing that is not the listing", async () => {
  for (const listing of [
    { repositories: [{ ...INSTALLATION, installedVersion: "latest" }], truncated: false },
    { repositories: [INSTALLATION] },
    { repositories: "all of them", truncated: false },
    new Response("not json", { status: 200 }),
    new Response(null, { status: 500 }),
  ]) {
    const { client } = harness(listing);
    await assert.rejects(
      () => client.open(),
      (error: unknown) =>
        error instanceof ConfiguratorError && error.reason === "unreadable",
      JSON.stringify(listing instanceof Response ? listing.status : listing),
    );
  }
});

test("tells a service that did not answer from one that answered badly", async () => {
  const client = createConfiguratorClient(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    () => {},
  );

  await assert.rejects(
    () => client.open(),
    (error: unknown) =>
      error instanceof ConfiguratorError && error.reason === "unreachable",
  );
});
