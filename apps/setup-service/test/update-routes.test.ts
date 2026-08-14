import assert from "node:assert/strict";
import { test } from "bun:test";

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
    async writeConfiguration(_token, _repository, source) {
      written.push(source);
      configuration = source;
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
  assert.deepEqual(await response!.json(), {
    repositories: [repository],
    truncated: false,
  });
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
