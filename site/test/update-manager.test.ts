import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  createUpdateClient,
  type InstallationSelector,
  type UpdateFetch,
} from "../src/lib/update-client.js";

/**
 * Covers the client behaviour the Configurator's update manager depends on.
 *
 * The manager itself is a mounted component whose whole job is asynchronous, so
 * server rendering it would only ever capture its first frame. What matters is
 * that the calls it makes behave the way it assumes: that an absent service is
 * reported as absent rather than as a failure, that a repository without a
 * version lock is distinguishable, and that repeating a start request is a
 * legitimate way to follow an update.
 */

const selector: InstallationSelector = { installationId: 7, repositoryId: 9 };

const withLock = {
  installationId: 7,
  repositoryId: 9,
  owner: "example",
  name: "status",
  htmlUrl: "https://github.com/example/status",
  installedVersion: "2.0.0",
};

const withoutLock = {
  ...withLock,
  repositoryId: 11,
  name: "notes",
  htmlUrl: "https://github.com/example/notes",
  installedVersion: null,
};

const session = { authenticated: true, csrfToken: "S".repeat(43) };

function client(routes: Record<string, unknown[]>) {
  const taken: Record<string, number> = {};
  const fetchImplementation: UpdateFetch = async (input, init = {}) => {
    const url = String(input);
    const key = Object.keys(routes).find((route) => url.startsWith(route));
    if (key === undefined) return new Response("{}", { status: 404 });
    const index = Math.min(taken[key] ?? 0, routes[key]!.length - 1);
    taken[key] = (taken[key] ?? 0) + 1;
    const answer = routes[key]![index];
    void init;
    return answer instanceof Response
      ? answer
      : new Response(JSON.stringify(answer), { status: 200 });
  };
  return { taken, client: createUpdateClient(fetchImplementation) };
}

test("separates a repository that can be updated from one that cannot", async () => {
  const { client: velvet } = client({
    "/api/installations": [
      { repositories: [withLock, withoutLock], truncated: false },
    ],
  });

  const listed = await velvet.listInstallations();

  assert.equal(listed.status, "ok");
  if (listed.status !== "ok") return;
  const manageable = listed.data.repositories.filter(
    (entry) => entry.installedVersion !== null,
  );
  assert.deepEqual(
    manageable.map((entry) => entry.name),
    ["status"],
    "a repository with no version lock was never created by the onboarding",
  );
});

test("says an absent service is absent rather than reporting a failure", async () => {
  const velvet = createUpdateClient(async () => {
    throw new TypeError("Failed to fetch");
  });

  assert.deepEqual(await velvet.listInstallations(), { status: "unavailable" });
});

test("keeps returning where an update stands whilst it is still running", async () => {
  const running = {
    operationId: "repository:9:velvet:2.0.1",
    version: "2.0.1",
    state: "waiting_for_checks",
  };
  const done = { ...running, state: "succeeded" };
  const { client: velvet, taken } = client({
    "/api/session": [session],
    "/api/updates": [running, running, done],
  });

  const first = await velvet.start(selector, "2.0.1");
  const second = await velvet.start(selector, "2.0.1");
  const third = await velvet.start(selector, "2.0.1");

  assert.equal(first.status === "ok" && first.data.state, "waiting_for_checks");
  assert.equal(second.status === "ok" && second.data.state, "waiting_for_checks");
  assert.equal(third.status === "ok" && third.data.state, "succeeded");
  assert.equal(taken["/api/updates"], 3, "following an update is repeating it");
});

test("reports a refusal with something a person can quote", async () => {
  const { client: velvet } = client({
    "/api/installations": [
      new Response(
        JSON.stringify({
          error: {
            code: "UPDATE_ACCESS_DENIED",
            message: "This Velvet installation is not available.",
            errorId: "abc123",
          },
        }),
        { status: 403 },
      ),
    ],
  });

  const result = await velvet.listInstallations();

  assert.equal(result.status, "error");
  assert.equal(result.status === "error" && result.errorId, "abc123");
});

test("corrects the preference to whatever the service settled on", async () => {
  const { client: velvet } = client({
    "/api/session": [session],
    "/api/updates/automatic": [{ automaticSecurityUpdates: true }],
  });

  // The manager shows the change immediately and then applies this answer, so
  // a write the service declined cannot leave the checkbox claiming otherwise.
  assert.deepEqual(await velvet.setAutomatic(selector, false), {
    status: "ok",
    data: true,
  });
});
