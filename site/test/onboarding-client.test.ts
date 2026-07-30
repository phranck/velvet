import assert from "node:assert/strict";
import { test } from "bun:test";

import { createBrowserSetupClient } from "../src/onboarding/client.js";
import {
  buildSetupRequest,
  createOnboardingDraft,
  type SetupProgressStage,
} from "../src/onboarding/state.js";

function validRequest() {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "Status";
  draft.services[0].name = "Website";
  draft.services[0].url = "https://example.com";
  const result = buildSetupRequest(draft);
  assert.equal(result.success, true);
  if (!result.success) throw new Error("Missing setup request.");
  return result.request;
}

test("posts one validated credentialed request and reads progress", async () => {
  const stages: SetupProgressStage[] = [];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createBrowserSetupClient(async (url, init) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) });
    if (String(url) === "/api/session") {
      return Response.json({
        authenticated: true,
        csrfToken: "C".repeat(43),
        user: {
          login: "velvet-user",
          avatarUrl: "https://avatars.githubusercontent.com/u/1",
        },
      });
    }
    return new Response(
      [
        JSON.stringify({ type: "progress", stage: "creating-repository" }),
        JSON.stringify({ type: "progress", stage: "waiting-for-deployment" }),
        JSON.stringify({
          type: "success",
          installationUrl: "https://status.example.com",
          repositoryUrl: "https://github.com/velvet-user/status",
        }),
      ].join("\n"),
      { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
    );
  });

  const result = await client.provision(validRequest(), (stage) => stages.push(stage));

  assert.deepEqual(calls.map((call) => call.url), ["/api/session", "/api/setup"]);
  assert.equal(calls[1]?.init?.method, "POST");
  assert.equal(calls[1]?.init?.credentials, "include");
  assert.equal(
    new Headers(calls[1]?.init?.headers).get("X-Velvet-CSRF"),
    "C".repeat(43),
  );
  assert.match(String(calls[1]?.init?.body), /"schemaVersion":1/);
  assert.deepEqual(stages, [
    "authenticating",
    "creating-repository",
    "waiting-for-deployment",
  ]);
  assert.deepEqual(result, { installationUrl: "https://status.example.com/" });
});

test("redirects an unauthenticated browser without accepting a browser token", async () => {
  const redirects: string[] = [];
  const client = createBrowserSetupClient(
    async () => Response.json({ authenticated: false, csrfToken: "C".repeat(43) }),
    undefined,
    (url) => redirects.push(url),
  );

  await assert.rejects(
    () => client.provision(validRequest()),
    /SETUP_REDIRECT_STARTED/,
  );
  assert.deepEqual(redirects, ["/api/auth/start"]);
});

test("redirects to the verified GitHub App installation URL", async () => {
  const redirects: string[] = [];
  let calls = 0;
  const installationUrl =
    `https://github.com/apps/velvet-setup/installations/new/permissions?` +
    `state=${"S".repeat(43)}&suggested_target_id=255022500&repository_ids%5B%5D=123456789`;
  const client = createBrowserSetupClient(
    async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json({ authenticated: true, csrfToken: "C".repeat(43) });
      }
      return new Response(
        JSON.stringify({
          type: "permission-required",
          access: "repository",
          error: {
            code: "INSTALLATION_REQUIRED",
            message: "Install Velvet.",
            errorId: "E".repeat(26),
          },
          installationUrl,
        }),
        { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
      );
    },
    undefined,
    (url) => redirects.push(url),
  );

  await assert.rejects(() => client.provision(validRequest()), /SETUP_REDIRECT_STARTED/);
  assert.equal(redirects[0], installationUrl);
});

test("rejects an installation URL that would grant access to every repository", async () => {
  const redirects: string[] = [];
  let calls = 0;
  const client = createBrowserSetupClient(
    async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json({ authenticated: true, csrfToken: "C".repeat(43) });
      }
      return new Response(
        JSON.stringify({
          type: "permission-required",
          access: "repository",
          error: {
            code: "INSTALLATION_REQUIRED",
            message: "Install Velvet.",
            errorId: "E".repeat(26),
          },
          installationUrl: `https://github.com/apps/velvet-setup/installations/new?state=${"S".repeat(43)}`,
        }),
        { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
      );
    },
    undefined,
    (url) => redirects.push(url),
  );

  await assert.rejects(() => client.provision(validRequest()), /SETUP_FAILED/);
  assert.deepEqual(redirects, []);
});

test("allows only the explicit temporary account URL for the bootstrap step", async () => {
  const redirects: string[] = [];
  let calls = 0;
  const installationUrl =
    `https://github.com/apps/velvet-setup/installations/new/permissions?` +
    `state=${"S".repeat(43)}&suggested_target_id=255022500`;
  const client = createBrowserSetupClient(
    async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json({ authenticated: true, csrfToken: "C".repeat(43) });
      }
      return new Response(
        JSON.stringify({
          type: "permission-required",
          access: "temporary-account",
          error: {
            code: "INSTALLATION_REQUIRED",
            message: "Temporarily install Velvet.",
            errorId: "E".repeat(26),
          },
          installationUrl,
        }),
        { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
      );
    },
    undefined,
    (url) => redirects.push(url),
  );

  await assert.rejects(() => client.provision(validRequest()), /SETUP_REDIRECT_STARTED/);
  assert.deepEqual(redirects, [installationUrl]);
});

test("rejects malformed events and non-HTTPS installation URLs", async () => {
  for (const body of [
    "not json",
    JSON.stringify({ type: "progress", stage: "unknown-stage" }),
    JSON.stringify({ type: "success", installationUrl: "javascript:alert(1)" }),
  ]) {
    let calls = 0;
    const client = createBrowserSetupClient(async () => {
      calls += 1;
      if (calls === 1) {
        return Response.json({ authenticated: true, csrfToken: "C".repeat(43) });
      }
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      });
    });
    await assert.rejects(() => client.provision(validRequest()), /SETUP_FAILED/);
  }
});
