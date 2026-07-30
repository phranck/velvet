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
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const client = createBrowserSetupClient(async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(
      [
        JSON.stringify({ type: "progress", stage: "creating-repository" }),
        JSON.stringify({ type: "progress", stage: "waiting-for-deployment" }),
        JSON.stringify({ type: "success", installationUrl: "https://status.example.com" }),
      ].join("\n"),
      { status: 200 },
    );
  });

  const result = await client.provision(validRequest(), (stage) => stages.push(stage));

  assert.equal(capturedUrl, "./api/setup");
  assert.equal(capturedInit?.method, "POST");
  assert.equal(capturedInit?.credentials, "include");
  assert.match(String(capturedInit?.body), /"schemaVersion":1/);
  assert.deepEqual(stages, ["creating-repository", "waiting-for-deployment"]);
  assert.deepEqual(result, { installationUrl: "https://status.example.com/" });
});

test("maps authorization responses without accepting a browser token", async () => {
  const client = createBrowserSetupClient(async () =>
    new Response("", { status: 403 }),
  );

  await assert.rejects(
    () => client.provision(validRequest()),
    /SETUP_PERMISSION_REQUIRED/,
  );
});

test("rejects malformed events and non-HTTPS installation URLs", async () => {
  for (const body of [
    "not json",
    JSON.stringify({ type: "progress", stage: "unknown-stage" }),
    JSON.stringify({ type: "success", installationUrl: "javascript:alert(1)" }),
  ]) {
    const client = createBrowserSetupClient(async () =>
      new Response(body, { status: 200 }),
    );
    await assert.rejects(() => client.provision(validRequest()), /SETUP_FAILED/);
  }
});
