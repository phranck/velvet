import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  createUpdateClient,
  type UpdateFetch,
} from "../src/lib/update-client.js";

const selector = { installationId: 7, repositoryId: 9 };

const repository = {
  installationId: 7,
  repositoryId: 9,
  owner: "example",
  name: "status",
  htmlUrl: "https://github.com/example/status",
  installedVersion: "1.9.0",
};

const update = {
  repository,
  installedVersion: "1.9.0",
  automaticSecurityUpdates: true,
  availableVersion: "2.0.0",
  releaseType: "feature",
  automaticInstallEligible: false,
  releaseNotes: "# Velvet 2.0.0\n",
};

const session = { authenticated: true, csrfToken: "S".repeat(43) };

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}

/**
 * Serves canned responses by path prefix and records what was asked for.
 *
 * A route may answer with a `Response` where the status matters, or with a
 * plain value where only the body does.
 */
function client(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetchImplementation: UpdateFetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? init.body : null,
    });
    const key = Object.keys(routes).find((route) => url.startsWith(route));
    const answer = key === undefined ? undefined : routes[key];
    if (answer instanceof Response) return answer;
    if (answer === undefined) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(answer), { status: 200 });
  };
  return { calls, client: createUpdateClient(fetchImplementation) };
}

test("reads one installation's version, preference, and release", async () => {
  const { client: velvet, calls } = client({ "/api/updates": update });

  const result = await velvet.read(selector);

  assert.equal(result.status, "ok");
  assert.deepEqual(result.status === "ok" ? result.data : null, update);
  assert.equal(calls[0]!.url, "/api/updates?installation=7&repository=9");
  assert.equal(calls[0]!.method, "GET");
});

test("lists what can be managed", async () => {
  const { client: velvet } = client({
    "/api/installations": { repositories: [repository], truncated: false },
  });

  const result = await velvet.listInstallations();

  assert.deepEqual(result, {
    status: "ok",
    data: { repositories: [repository], truncated: false },
  });
});

test("proves a write is intended before sending it", async () => {
  const { client: velvet, calls } = client({
    "/api/session": session,
    "/api/updates": {
      operationId: "repository:9:velvet:2.0.0",
      version: "2.0.0",
      state: "waiting_for_checks",
    },
  });

  const result = await velvet.start(selector, "2.0.0");

  assert.equal(result.status, "ok");
  const write = calls.find(({ method }) => method === "POST")!;
  assert.equal(write.headers.get("X-Velvet-CSRF"), session.csrfToken);
  assert.deepEqual(JSON.parse(write.body!), { ...selector, version: "2.0.0" });
});

test("does not attempt a write without a session to write with", async () => {
  const { client: velvet, calls } = client({
    "/api/session": { authenticated: false },
  });

  assert.deepEqual(await velvet.start(selector, "2.0.0"), {
    status: "unavailable",
  });
  assert.equal(
    calls.some(({ method }) => method === "POST"),
    false,
  );
});

test("reports an unreachable service as unavailable, not as a failure", async () => {
  const velvet = createUpdateClient(async () => {
    throw new TypeError("Failed to fetch");
  });

  assert.deepEqual(await velvet.read(selector), { status: "unavailable" });
  assert.deepEqual(await velvet.listInstallations(), { status: "unavailable" });
});

test("passes a refusal through with its code and identifier", async () => {
  const { client: velvet } = client({
    "/api/updates": new Response(
      JSON.stringify({
        error: {
          code: "UPDATE_ACCESS_DENIED",
          message: "This Velvet installation is not available.",
          errorId: "abc123",
        },
      }),
      { status: 403 },
    ),
  });

  assert.deepEqual(await velvet.read(selector), {
    status: "error",
    code: "UPDATE_ACCESS_DENIED",
    message: "This Velvet installation is not available.",
    errorId: "abc123",
  });
});

test("treats a failure body it did not produce as unavailable", async () => {
  const { client: velvet } = client({
    "/api/updates": new Response("<html>gateway timeout</html>", {
      status: 504,
    }),
  });

  assert.deepEqual(await velvet.read(selector), { status: "unavailable" });
});

test("treats a signed-out session as unavailable rather than an error", async () => {
  const { client: velvet } = client({
    "/api/updates": new Response("{}", { status: 401 }),
  });

  assert.deepEqual(await velvet.read(selector), { status: "unavailable" });
});

test("shows nothing rather than something wrong", async () => {
  const malformed: unknown[] = [
    { ...update, availableVersion: "not-a-version" },
    { ...update, releaseType: "urgent" },
    { ...update, automaticInstallEligible: "yes" },
    { ...update, releaseNotes: 42 },
    { ...update, automaticSecurityUpdates: "on" },
    { ...update, repository: { ...repository, repositoryId: "nine" } },
    { availableVersion: "2.0.0" },
    "release",
  ];

  for (const body of malformed) {
    const { client: velvet } = client({ "/api/updates": body });
    assert.deepEqual(
      await velvet.read(selector),
      { status: "unavailable" },
      JSON.stringify(body),
    );
  }
});

test("refuses an operation naming a state it does not know", async () => {
  const { client: velvet } = client({
    "/api/session": session,
    "/api/updates": {
      operationId: "repository:9:velvet:2.0.0",
      version: "2.0.0",
      state: "almost_done",
    },
  });

  assert.deepEqual(await velvet.start(selector, "2.0.0"), {
    status: "unavailable",
  });
});

test("carries an operation's pull request when the service reports one", async () => {
  const { client: velvet } = client({
    "/api/session": session,
    "/api/updates": {
      operationId: "repository:9:velvet:2.0.0",
      version: "2.0.0",
      state: "failed",
      reason: "checks_failed",
      pullRequest: {
        number: 4,
        htmlUrl: "https://github.com/example/status/pull/4",
      },
    },
  });

  const result = await velvet.start(selector, "2.0.0");

  assert.equal(result.status, "ok");
  assert.deepEqual(result.status === "ok" ? result.data.pullRequest : null, {
    number: 4,
    htmlUrl: "https://github.com/example/status/pull/4",
  });
});

test("reports the preference the service settled on", async () => {
  const { client: velvet, calls } = client({
    "/api/session": session,
    "/api/updates/automatic": { automaticSecurityUpdates: false },
  });

  assert.deepEqual(await velvet.setAutomatic(selector, false), {
    status: "ok",
    data: false,
  });
  const write = calls.find(({ method }) => method === "POST")!;
  assert.deepEqual(JSON.parse(write.body!), { ...selector, enabled: false });
});
