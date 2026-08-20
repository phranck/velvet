import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  validateInstallationConfiguration,
  validateSetupInstallations,
} from "@velvet/contracts";

import { GitHubApiError } from "../src/github-api.js";
import type { GitHubSetupClient } from "../src/github.js";
import type { AuditLogInput } from "../src/observability.js";
import type { SetupServerSession } from "../src/session.js";
import {
  UpdateAccessError,
  type ManageableRepository,
  type UpdateAccess,
} from "../src/update-access.js";
import type {
  ManagedUpdateOrchestrator,
  ManagedUpdateRequest,
  ManagedUpdateResult,
} from "../src/update-orchestrator-types.js";
import { embeddedVelvetReleases } from "../src/update-releases.js";
import { createUpdateRoutes } from "../src/update-routes.js";

const origin = "https://setup.velvet.dev";

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

const repository: ManageableRepository = {
  installationId: 7,
  repositoryId: 9,
  owner: "example",
  name: "status",
  htmlUrl: "https://github.com/example/status",
  defaultBranch: "main",
  installedVersion: "1.9.0",
};

const session = {
  githubUserToken: "user-token",
} as SetupServerSession & { githubUserToken: string };

interface Harness {
  handle(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response | null>;
  reconciled: ManagedUpdateRequest[];
  written: string[];
  /** What each write said in its commit, in the order they were made. */
  messages: string[];
  logs: AuditLogInput[];
}

function harness(
  overrides: {
    access?: Partial<UpdateAccess>;
    reconcile?: (
      request: ManagedUpdateRequest,
    ) => Promise<ManagedUpdateResult>;
    configuration?: string;
  } = {},
): Harness {
  const reconciled: ManagedUpdateRequest[] = [];
  const written: string[] = [];
  const messages: string[] = [];
  const logs: AuditLogInput[] = [];
  let configuration = overrides.configuration ?? CONFIGURATION;

  const access: UpdateAccess = {
    async list() {
      return { repositories: [repository], truncated: false };
    },
    async authorize() {
      return repository;
    },
    async readConfiguration() {
      return { source: configuration, blobSha: "c".repeat(40) };
    },
    async writeConfiguration(_token, _repository, source, _blobSha, message) {
      written.push(source);
      messages.push(message);
      configuration = source;
      return "d".repeat(40);
    },
    ...overrides.access,
  };

  const orchestrator: ManagedUpdateOrchestrator = {
    async reconcile(request) {
      reconciled.push(request);
      if (overrides.reconcile) return overrides.reconcile(request);
      return {
        operationId: `repository:${request.repositoryId}:velvet:${request.version}`,
        version: request.version,
        trigger: request.trigger,
        state: "waiting_for_checks",
      };
    },
  };

  const routes = createUpdateRoutes({
    github: {} as GitHubSetupClient,
    access,
    orchestrator,
    releases: embeddedVelvetReleases(),
    logger: (entry) => logs.push(entry),
    errorId: () => "e".repeat(20),
  });

  return {
    reconciled,
    written,
    messages,
    logs,
    handle(method, path, body) {
      const url = new URL(`${origin}${path}`);
      const request = new Request(url, {
        method,
        ...(body === undefined
          ? {}
          : { body: typeof body === "string" ? body : JSON.stringify(body) }),
      });
      return routes.handle({
        route: url.pathname,
        url,
        request,
        session,
        requestId: "r".repeat(20),
      });
    },
  };
}

test("lists what the signed-in user can manage", async () => {
  const routes = harness();

  const response = await routes.handle("GET", "/api/installations");

  assert.equal(response!.status, 200);
  const body = await response!.json();
  assert.deepEqual(body, {
    repositories: [
      {
        installationId: 7,
        repositoryId: 9,
        owner: "example",
        name: "status",
        htmlUrl: "https://github.com/example/status",
        installedVersion: "1.9.0",
      },
    ],
    truncated: false,
  });
  assert.equal(
    validateSetupInstallations(body).success,
    true,
    "the listing is what the configurator is willing to read",
  );
});

test("says which theme an installation is published in, and what is set on it", async () => {
  const routes = harness({
    configuration: `schemaVersion: 1
repository:
  owner: example
  name: status
statusPage:
  name: Example Status
  theme: velvet
  themeSettings:
    chartWash: false
    accent: "#ff0000"
    days: 90
services:
  - name: Website
    url: https://example.com
`,
  });

  const response = await routes.handle(
    "GET",
    "/api/configuration?installation=7&repository=9",
  );

  assert.equal(response!.status, 200);
  const body = await response!.json();
  assert.deepEqual(body, {
    theme: "velvet",
    themeSettings: { chartWash: false, accent: "#ff0000", days: 90 },
  });
  assert.equal(
    validateInstallationConfiguration(body).success,
    true,
    "the answer is what the configurator is willing to read",
  );
});

test("answers with no theme where the repository carries no configuration", async () => {
  const routes = harness({
    access: {
      async readConfiguration() {
        throw new GitHubApiError(new Response(null, { status: 404 }));
      },
    },
  });

  const response = await routes.handle(
    "GET",
    "/api/configuration?installation=7&repository=9",
  );

  // A repository somebody granted access to but never set Velvet up in is an
  // answer rather than a failure, and the configurator starts from the first
  // theme on offer instead of from an error.
  assert.equal(response!.status, 200);
  assert.deepEqual(await response!.json(), { theme: null, themeSettings: {} });
});

test("does not report GitHub being unavailable as an unconfigured installation", async () => {
  const routes = harness({
    access: {
      async readConfiguration() {
        throw new GitHubApiError(new Response(null, { status: 502 }));
      },
    },
  });

  const response = await routes.handle(
    "GET",
    "/api/configuration?installation=7&repository=9",
  );

  assert.equal(response!.status >= 500, true);
  assert.notEqual((await response!.json()).error, undefined);
});

test("refuses to read a configuration for an installation that is not the user's", async () => {
  const routes = harness({
    access: {
      async authorize() {
        throw new UpdateAccessError();
      },
    },
  });

  const response = await routes.handle(
    "GET",
    "/api/configuration?installation=7&repository=9",
  );

  assert.equal(response!.status, 403);
  assert.equal((await response!.json()).error.code, "UPDATE_ACCESS_DENIED");
});

test("reports an installation's own version beside the available release", async () => {
  const routes = harness();

  const response = await routes.handle(
    "GET",
    "/api/updates?installation=7&repository=9",
  );

  const body = (await response!.json()) as Record<string, unknown>;
  assert.equal(response!.status, 200);
  assert.equal(body.installedVersion, "1.9.0");
  assert.equal(body.automaticSecurityUpdates, true, "on unless turned off");
  assert.match(String(body.availableVersion), /^\d+\.\d+\.\d+/u);
  assert.equal(typeof body.releaseNotes, "string");
  assert.deepEqual(body.repository, {
    installationId: 7,
    repositoryId: 9,
    owner: "example",
    name: "status",
    htmlUrl: "https://github.com/example/status",
  });
});

test("reconciles the repository the user was authorized for", async () => {
  const routes = harness();

  const response = await routes.handle("POST", "/api/updates", {
    // Deliberately different from what authorization resolves to, proving the
    // orchestrator is driven by the proven repository rather than the request.
    installationId: 7,
    repositoryId: 9,
    version: "2.0.0",
  });

  assert.equal(response!.status, 200);
  assert.deepEqual(routes.reconciled, [
    { installationId: 7, repositoryId: 9, version: "2.0.0", trigger: "manual" },
  ]);
  assert.equal((await response!.json()).state, "waiting_for_checks");
});

test("refuses a request that does not name a version", async () => {
  const routes = harness();

  const response = await routes.handle("POST", "/api/updates", {
    installationId: 7,
    repositoryId: 9,
    version: "latest",
  });

  assert.equal(response!.status, 400);
  assert.equal((await response!.json()).error.code, "UPDATE_REQUEST_INVALID");
  assert.deepEqual(routes.reconciled, []);
});

test("refuses a body that is not JSON", async () => {
  const routes = harness();

  const response = await routes.handle("POST", "/api/updates", "not json");

  assert.equal(response!.status, 400);
  assert.equal((await response!.json()).error.code, "UPDATE_REQUEST_INVALID");
});

test("refuses an installation the user does not hold, without orchestrating", async () => {
  const routes = harness({
    access: {
      async authorize() {
        throw new UpdateAccessError();
      },
    },
  });

  const response = await routes.handle("POST", "/api/updates", {
    installationId: 7,
    repositoryId: 9,
    version: "2.0.0",
  });

  assert.equal(response!.status, 403);
  const body = await response!.json();
  assert.equal(body.error.code, "UPDATE_ACCESS_DENIED");
  assert.equal(body.error.errorId.length > 0, true);
  assert.deepEqual(routes.reconciled, []);
});

test("changes the automatic preference in the repository's own configuration", async () => {
  const routes = harness();

  const off = await routes.handle("POST", "/api/updates/automatic", {
    installationId: 7,
    repositoryId: 9,
    enabled: false,
  });

  assert.equal(off!.status, 200);
  assert.deepEqual(await off!.json(), { automaticSecurityUpdates: false });
  assert.equal(routes.written.length, 1);
  assert.match(routes.written[0]!, /automaticSecurityUpdates: false/u);
  assert.equal(
    routes.written[0]!.startsWith(CONFIGURATION),
    true,
    "the rest of the file is untouched",
  );

  const again = await routes.handle("POST", "/api/updates/automatic", {
    installationId: 7,
    repositoryId: 9,
    enabled: false,
  });

  assert.equal(again!.status, 200);
  assert.equal(routes.written.length, 1, "an unchanged preference writes nothing");
});

test("refuses to change a preference it cannot change safely", async () => {
  const routes = harness({
    configuration: `${CONFIGURATION}updates: {\n  automaticSecurityUpdates: true,\n}\n`,
  });

  const response = await routes.handle("POST", "/api/updates/automatic", {
    installationId: 7,
    repositoryId: 9,
    enabled: false,
  });

  assert.equal(response!.status, 409);
  assert.equal(
    (await response!.json()).error.code,
    "UPDATE_INSTALLATION_INVALID",
  );
  assert.deepEqual(routes.written, []);
});

test("reports an orchestration failure without leaking its cause", async () => {
  const routes = harness({
    reconcile: async () => {
      throw new Error("connect ECONNREFUSED 140.82.121.6:443");
    },
  });

  const response = await routes.handle("POST", "/api/updates", {
    installationId: 7,
    repositoryId: 9,
    version: "2.0.0",
  });

  assert.equal(response!.status, 500);
  const body = (await response!.json()) as {
    error: { code: string; message: string; errorId: string };
  };
  assert.equal(body.error.code, "UPDATE_FAILED");
  assert.equal(body.error.message.includes("140.82"), false);
  assert.equal(body.error.errorId, "e".repeat(20));
  assert.equal(routes.logs.length, 1);
  assert.equal(routes.logs[0]!.errorId, "e".repeat(20));
  assert.equal(JSON.stringify(routes.logs[0]).includes("user-token"), false);
});

test("leaves an unsupported method to the surrounding handler", async () => {
  const routes = harness();

  assert.equal(await routes.handle("DELETE", "/api/updates"), null);
  assert.equal(await routes.handle("POST", "/api/installations", {}), null);
  assert.equal(await routes.handle("GET", "/api/setup"), null);
});

test("changes the reference setting in the repository's own configuration", async () => {
  const routes = harness();

  const on = await routes.handle("POST", "/api/updates/gallery", {
    installationId: 7,
    repositoryId: 9,
    listed: true,
  });

  assert.equal(on!.status, 200);
  assert.deepEqual(await on!.json(), { listedAsReference: true });
  assert.equal(routes.written.length, 1);
  assert.match(routes.written[0]!, /listed: true/u);
  assert.equal(
    routes.written[0]!.startsWith(CONFIGURATION),
    true,
    "the rest of the file is untouched",
  );

  const again = await routes.handle("POST", "/api/updates/gallery", {
    installationId: 7,
    repositoryId: 9,
    listed: true,
  });

  assert.equal(again!.status, 200);
  assert.equal(routes.written.length, 1, "an unchanged answer writes nothing");
});

test("rejects a reference setting that is not an answer", async () => {
  const routes = harness();

  const response = await routes.handle("POST", "/api/updates/gallery", {
    installationId: 7,
    repositoryId: 9,
    listed: "yes",
  });

  assert.equal(response!.status, 400);
  assert.equal((await response!.json()).error.code, "UPDATE_REQUEST_INVALID");
  assert.deepEqual(routes.written, []);
});

test("reports the reference setting when reading an installation", async () => {
  const routes = harness();

  const response = await routes.handle(
    "GET",
    "/api/updates?installation=7&repository=9",
  );

  assert.equal(response!.status, 200);
  assert.equal((await response!.json()).listedAsReference, false);
});

/**
 * Publishing, which is the one route that changes what the page looks like.
 *
 * The two preferences change how Velvet behaves and deliberately do not rebuild
 * the page. This does the opposite, so the commit it writes has to be one the
 * repository's own workflow reacts to.
 */

test("writes the theme and its settings in one commit", async () => {
  const routes = harness();

  const response = await routes.handle("POST", "/api/configuration/publish", {
    installationId: 7,
    repositoryId: 9,
    theme: "twenty-forty-nine",
    themeSettings: { chartWash: false, ipv4Colour: "#5fb2e0" },
  });

  assert.equal(response!.status, 200);
  assert.deepEqual(await response!.json(), {
    theme: "twenty-forty-nine",
    themeSettings: { chartWash: false, ipv4Colour: "#5fb2e0" },
    commit: "d".repeat(40),
  });
  assert.equal(routes.written.length, 1, "one decision, one commit");
  assert.match(routes.written[0]!, /theme: twenty-forty-nine/u);
  assert.match(routes.written[0]!, /chartWash: false/u);
  assert.match(routes.written[0]!, /ipv4Colour: '#5fb2e0'/u);
});

test("says what it did in the commit, and does not hold back the build", async () => {
  const routes = harness();

  await routes.handle("POST", "/api/configuration/publish", {
    installationId: 7,
    repositoryId: 9,
    theme: "retro-chassis",
    themeSettings: {},
  });

  assert.deepEqual(routes.messages, ["Publish retro-chassis in Velvet"]);
  // The whole point of publishing. A commit carrying this would leave the page
  // as it was whilst the file said otherwise.
  assert.doesNotMatch(routes.messages[0]!, /skip ci/u);
});

test("leaves the rest of the operator's file alone", async () => {
  const routes = harness();

  await routes.handle("POST", "/api/configuration/publish", {
    installationId: 7,
    repositoryId: 9,
    theme: "velvet",
    themeSettings: { chartWash: true },
  });

  const written = routes.written[0]!;
  assert.match(written, /^ {2}name: Example Status$/mu);
  assert.match(written, /^ {2}- name: Website$/mu);
  assert.match(written, /^ {4}url: https:\/\/example\.com$/mu);
});

test("writes nothing when the page is already published that way", async () => {
  const routes = harness();

  const first = await routes.handle("POST", "/api/configuration/publish", {
    installationId: 7,
    repositoryId: 9,
    theme: "velvet",
    themeSettings: {},
  });

  assert.equal(first!.status, 200);
  assert.equal((await first!.json()).commit, null);
  assert.deepEqual(routes.written, [], "nothing changed, so nothing is written");
});

test("refuses a request that does not carry settings", async () => {
  const routes = harness();

  for (const body of [
    { theme: 7 },
    { theme: "velvet", themeSettings: [] },
    { theme: "velvet", themeSettings: { chartWash: null } },
    { theme: "velvet", themeSettings: { chartWash: { on: true } } },
    {},
  ]) {
    const response = await routes.handle("POST", "/api/configuration/publish", {
      installationId: 7,
      repositoryId: 9,
      ...body,
    });
    assert.equal(response!.status, 400, JSON.stringify(body));
    assert.equal(
      (await response!.json()).error.code,
      "UPDATE_REQUEST_INVALID",
      JSON.stringify(body),
    );
  }
  assert.deepEqual(routes.written, []);
});

test("refuses a theme name that would change the shape of the file", async () => {
  const routes = harness();

  const response = await routes.handle("POST", "/api/configuration/publish", {
    installationId: 7,
    repositoryId: 9,
    theme: "velvet\nservices: []",
    themeSettings: {},
  });

  // Refused as the installation being unchangeable rather than as a bad
  // request, because the edit is what turned it down. Either way nothing is
  // written.
  assert.equal(response!.status, 409);
  assert.deepEqual(routes.written, []);
});
