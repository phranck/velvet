import assert from "node:assert/strict";
import { test } from "bun:test";

import { validateSetupRequest, type SetupEvent } from "@velvet/contracts";

import { GitHubApiError, type GitHubSetupClient } from "../src/github.js";
import { provisionVelvet } from "../src/provision.js";
import { createSessionStore } from "../src/session.js";
import { SetupServiceError } from "../src/setup-error.js";

const normalizedRequest = (() => {
  const result = validateSetupRequest({
    configuration: {
      schemaVersion: 1,
      repository: { owner: "example", name: "status" },
      statusPage: { name: "Example Status" },
      services: [{ name: "Website", url: "https://example.com" }],
    },
  });
  if (!result.success) throw new Error("Test configuration is invalid.");
  return result.data;
})();

function authenticatedSession() {
  let index = 0;
  const session = createSessionStore({
    secret: "s".repeat(32),
    randomToken: () => `${index++}`.padStart(43, "A"),
  }).create();
  session.githubUserToken = "user-token";
  session.user = { login: "example", avatarUrl: "https://avatars.githubusercontent.com/u/1" };
  session.installation = {
    id: 7,
    accountLogin: "example",
    accountType: "User",
    repositorySelection: "selected",
  };
  return session;
}

function successfulGitHub(overrides: Partial<GitHubSetupClient> = {}) {
  const calls: string[] = [];
  const client: GitHubSetupClient = {
    async exchangeOAuthCode() { throw new Error("unused"); },
    async viewer() { throw new Error("unused"); },
    async account() {
      calls.push("account");
      return { id: 255_022_500, login: "example", type: "User" };
    },
    async listInstallations() { throw new Error("unused"); },
    async createRepositoryFromTemplate() {
      calls.push("create-repository");
      return {
        id: 99,
        name: "status",
        owner: "example",
        ownerId: 255_022_500,
        htmlUrl: "https://github.com/example/status",
        defaultBranch: "main",
      };
    },
    async createInstallationToken() {
      calls.push("create-installation-token");
      return "installation-token";
    },
    async deleteInstallation() { calls.push("delete-installation"); },
    async getConfigurationSha() {
      calls.push("get-configuration");
      return "template-sha";
    },
    async writeConfiguration(_token, _owner, _repository, source) {
      calls.push("write-configuration");
      assert.match(source, /^schemaVersion: 1\n/);
    },
    async enablePages() {
      calls.push("enable-pages");
      return { htmlUrl: "https://example.github.io/status/", status: "building" };
    },
    async dispatchWorkflow() {
      calls.push("dispatch-workflow");
      return 777;
    },
    async workflowRun() {
      calls.push("workflow-run");
      return {
        id: 777,
        status: "completed",
        conclusion: "success",
        htmlUrl: "https://github.com/example/status/actions/runs/777",
      };
    },
    async pages() {
      calls.push("pages");
      return { htmlUrl: "https://example.github.io/status/", status: "built" };
    },
    async revokeUserToken() { calls.push("revoke"); },
    ...overrides,
  };
  return { client, calls };
}

test("creates, configures, enables, dispatches, and verifies one repository", async () => {
  const session = authenticatedSession();
  const { client, calls } = successfulGitHub();
  const events: SetupEvent[] = [];

  const result = await provisionVelvet({
    session,
    request: normalizedRequest,
    github: client,
    onEvent: (event) => events.push(event),
    operationId: () => "O".repeat(26),
    sleep: async () => {},
  });

  assert.deepEqual(calls, [
    "create-repository",
    "create-installation-token",
    "get-configuration",
    "write-configuration",
    "enable-pages",
    "dispatch-workflow",
    "workflow-run",
    "pages",
  ]);
  assert.deepEqual(
    events.filter((event) => event.type === "progress").map((event) => event.stage),
    [
      "creating-repository",
      "writing-configuration",
      "enabling-pages",
      "starting-monitor",
      "waiting-for-deployment",
    ],
  );
  assert.equal(result.type, "success");
  assert.equal(result.installationUrl, "https://example.github.io/status/");
  assert.equal(session.operation?.state, "succeeded");
  assert.equal("installationToken" in (session.provisioning ?? {}), false);
});

test("requires a temporary installation before creating the repository", async () => {
  const session = authenticatedSession();
  delete session.installation;
  const { client, calls } = successfulGitHub();

  await assert.rejects(
    () =>
      provisionVelvet({
        session,
        request: normalizedRequest,
        github: client,
        onEvent: () => {},
      }),
    (error: unknown) => {
      assert.equal(error instanceof SetupServiceError, true);
      assert.equal((error as SetupServiceError).code, "INSTALLATION_REQUIRED");
      return true;
    },
  );
  assert.deepEqual(calls, ["account"]);
  assert.equal(session.provisioning?.repository, undefined);
  assert.deepEqual(session.provisioning?.target, {
    id: 255_022_500,
    login: "example",
    type: "User",
  });
});

test("removes a temporary all-repository installation immediately after repository creation", async () => {
  const session = authenticatedSession();
  session.installation!.repositorySelection = "all";
  const { client, calls } = successfulGitHub();

  await assert.rejects(
    () =>
      provisionVelvet({
        session,
        request: normalizedRequest,
        github: client,
        onEvent: () => {},
      }),
    (error: unknown) => {
      assert.equal((error as SetupServiceError).code, "INSTALLATION_REQUIRED");
      return true;
    },
  );

  assert.deepEqual(calls, ["create-repository", "delete-installation"]);
  assert.equal(session.installation, undefined);
  assert.equal(session.provisioning?.repository?.id, 99);
});

test("waits until the installation token can read the generated configuration", async () => {
  const session = authenticatedSession();
  let accessChecks = 0;
  let sleeps = 0;
  const { client, calls } = successfulGitHub({
    async getConfigurationSha() {
      calls.push("get-configuration");
      accessChecks += 1;
      if (accessChecks === 1) {
        throw new GitHubApiError(new Response(null, { status: 404 }));
      }
      return "template-sha";
    },
  });

  const result = await provisionVelvet({
    session,
    request: normalizedRequest,
    github: client,
    onEvent: () => {},
    sleep: async () => { sleeps += 1; },
  });

  assert.equal(result.type, "success");
  assert.equal(accessChecks, 2);
  assert.equal(sleeps, 1);
  assert.ok(
    calls.lastIndexOf("get-configuration") <
      calls.indexOf("write-configuration"),
  );
});

test("maps a GitHub rate limit to a safe retryable setup error", async () => {
  const session = authenticatedSession();
  const { client } = successfulGitHub({
    async createRepositoryFromTemplate() {
      throw new GitHubApiError(
        new Response(null, { status: 403, headers: { "Retry-After": "60" } }),
      );
    },
  });

  await assert.rejects(
    () => provisionVelvet({ session, request: normalizedRequest, github: client, onEvent: () => {} }),
    (error: unknown) => {
      assert.equal((error as SetupServiceError).code, "GITHUB_RATE_LIMITED");
      assert.equal((error as SetupServiceError).message.includes("60"), false);
      assert.equal((error as SetupServiceError).recoverable, true);
      return true;
    },
  );
});

test("resumes after a partial configuration failure without creating another repository", async () => {
  const session = authenticatedSession();
  let writeAttempts = 0;
  const { client, calls } = successfulGitHub({
    async writeConfiguration() {
      calls.push("write-configuration");
      writeAttempts += 1;
      if (writeAttempts === 1) throw new Error("temporary upstream failure");
    },
  });

  await assert.rejects(
    () => provisionVelvet({ session, request: normalizedRequest, github: client, onEvent: () => {} }),
    (error: unknown) => {
      assert.equal((error as SetupServiceError).code, "CONFIGURATION_COMMIT_FAILED");
      assert.equal((error as SetupServiceError).recoverable, true);
      return true;
    },
  );
  assert.equal(session.provisioning?.repository?.id, 99);
  assert.equal(session.operation?.state, "failed");

  const result = await provisionVelvet({
    session,
    request: normalizedRequest,
    github: client,
    onEvent: () => {},
    sleep: async () => {},
  });

  assert.equal(result.type, "success");
  assert.equal(calls.filter((call) => call === "create-repository").length, 1);
  assert.equal(calls.filter((call) => call === "create-installation-token").length, 2);
  assert.equal(calls.filter((call) => call === "write-configuration").length, 2);
});

test("does not recreate Pages when GitHub confirms it is already enabled", async () => {
  const session = authenticatedSession();
  const { client, calls } = successfulGitHub({
    async enablePages() {
      calls.push("enable-pages");
      throw new GitHubApiError(new Response(null, { status: 409 }));
    },
  });

  const result = await provisionVelvet({
    session,
    request: normalizedRequest,
    github: client,
    onEvent: () => {},
    sleep: async () => {},
  });

  assert.equal(result.type, "success");
  assert.equal(calls.filter((call) => call === "pages").length, 2);
});
