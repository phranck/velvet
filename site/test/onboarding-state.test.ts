import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  buildSetupRequest,
  createOnboardingDraft,
  createServiceDraft,
  submitOnboarding,
  type SetupClient,
} from "../src/onboarding/state.js";

test("builds a canonical minimal website check with contract defaults", () => {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "My Status";
  draft.services = [
    {
      ...createServiceDraft("website"),
      name: "Website",
      url: "https://example.com",
    },
  ];

  const result = buildSetupRequest(draft);

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.request.configuration.statusPage.icons, {});
  assert.equal("customDomain" in result.request.configuration.statusPage, false);
  assert.equal(result.request.configuration.services[0].checks[0].method, "GET");
  assert.deepEqual(
    result.request.configuration.services[0].checks[0].expectedStatusCodes,
    [200],
  );
  assert.equal(result.request.configuration.services[0].checks[0].maxRedirects, 5);
  assert.equal(result.request.configuration.services[0].checks[0].timeoutMs, 10_000);
  assert.deepEqual(result.request.configuration.services[0].checks[0].jsonAssertions, []);
});

test("normalizes an optional custom-domain hostname before setup", () => {
  const draft = Object.assign(createOnboardingDraft(), {
    customDomain: "  Status.Example.COM  ",
  });
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "My Status";
  draft.services = [
    {
      ...createServiceDraft("website"),
      name: "Website",
      url: "https://example.com",
    },
  ];

  const result = buildSetupRequest(draft);

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(
    result.request.configuration.statusPage.customDomain,
    "status.example.com",
  );
});

test("rejects custom-domain values that are not plain hostnames", () => {
  for (const customDomain of [
    "https://status.example.com",
    "status.example.com/path",
    "status.example.com:443",
    "user@status.example.com",
    "*.example.com",
  ]) {
    const draft = Object.assign(createOnboardingDraft(), { customDomain });
    draft.repositoryOwner = "velvet-user";
    draft.repositoryName = "status";
    draft.statusPageName = "My Status";
    draft.services[0].name = "Website";
    draft.services[0].url = "https://example.com";

    const result = buildSetupRequest(draft);

    assert.equal(result.success, false, customDomain);
    if (result.success) continue;
    assert.equal(
      result.errors.customDomain,
      "Enter a hostname without https://, a path, port, credentials, or wildcard.",
    );
  }
});

test("serializes only an explicit curated icon under the normalized service id", () => {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "My Status";
  draft.services = [
    {
      ...createServiceDraft("storage"),
      name: "Object Storage",
      url: "https://storage.example.com",
      icon: "ph-hard-drives",
    },
  ];

  const result = buildSetupRequest(draft);

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.request.configuration.statusPage.icons, {
    "object-storage": "ph-hard-drives",
  });
});

test("rejects arbitrary icon classes before creating a setup request", () => {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "My Status";
  draft.services = [
    {
      ...createServiceDraft("website"),
      name: "Website",
      url: "https://example.com",
      icon: "ph-not-in-the-curated-set",
    },
  ];

  const result = buildSetupRequest(draft);

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errors["services.0.icon"], "Choose an icon from the available set.");
});

test("keeps JSON assertions out of the default path and validates advanced checks", () => {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "My Status";
  draft.services = [
    {
      ...createServiceDraft("api"),
      name: "API",
      url: "https://api.example.com/health",
      advanced: true,
      expectedStatusCodes: "200, 204",
      timeoutMs: 5_000,
      headers: [
        { id: "header", name: "Authorization", secret: "API_HEALTH_TOKEN" },
      ],
      jsonAssertions: [
        { id: "assertion", path: "/status", valueType: "string", value: "ok" },
      ],
    },
  ];

  const result = buildSetupRequest(draft);

  assert.equal(result.success, true);
  if (!result.success) return;
  const check = result.request.configuration.services[0].checks[0];
  assert.deepEqual(check.expectedStatusCodes, [200, 204]);
  assert.equal(check.timeoutMs, 5_000);
  assert.deepEqual(check.headers, [
    { name: "Authorization", secret: "API_HEALTH_TOKEN" },
  ]);
  assert.deepEqual(check.jsonAssertions, [{ path: "/status", equals: "ok" }]);
});

test("does not call the setup client for invalid input", async () => {
  let calls = 0;
  const client: SetupClient = {
    async provision() {
      calls += 1;
      return { installationUrl: "https://example.com" };
    },
  };

  const result = await submitOnboarding(createOnboardingDraft(), client);

  assert.equal(result.state, "invalid");
  assert.equal(calls, 0);
});

test("leaves the draft untouched when provisioning needs a retry", async () => {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "My Status";
  draft.services[0].name = "Website";
  draft.services[0].url = "https://example.com";
  const snapshot = structuredClone(draft);

  const result = await submitOnboarding(draft, {
    async provision() {
      throw new Error("SETUP_PERMISSION_REQUIRED");
    },
  });

  assert.equal(result.state, "permission-required");
  assert.deepEqual(draft, snapshot);
});

test("keeps the draft while GitHub authorization continues", async () => {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "My Status";
  draft.services[0].name = "Website";
  draft.services[0].url = "https://example.com";
  const snapshot = structuredClone(draft);

  const result = await submitOnboarding(draft, {
    async provision() {
      throw new Error("SETUP_REDIRECT_STARTED");
    },
  });

  assert.equal(result.state, "permission-required");
  assert.deepEqual(draft, snapshot);
});

test("creates stable unique UI keys for repeatable service rows", () => {
  assert.notEqual(createServiceDraft().id, createServiceDraft().id);
});
