import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  buildSetupRequest,
  createOnboardingDraft,
  createServiceDraft,
  submitOnboarding,
  validateBasicsStep,
  validateServicesStep,
  type OnboardingDraft,
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

test("refuses to leave the Services step while a URL is not an HTTP address", () => {
  for (const url of [
    "not a url",
    "example.com",
    "ftp://example.com",
    "https://user:secret@example.com",
    "https://example.com/#section",
  ]) {
    const draft = createOnboardingDraft();
    draft.services = [{ ...createServiceDraft("website"), name: "Website", url }];

    const errors = validateServicesStep(draft);

    assert.equal(
      errors["services.0.url"],
      "URL must be an absolute HTTP(S) URL without credentials or a fragment.",
      url,
    );
  }
});

test("keeps the plainer wording when a service field is simply empty", () => {
  const draft = createOnboardingDraft();
  draft.services = [{ ...createServiceDraft("website"), name: "", url: "" }];

  const errors = validateServicesStep(draft);

  assert.equal(errors["services.0.name"], "Enter a service name.");
  assert.equal(errors["services.0.url"], "Enter a URL to monitor.");
});

test("lets a valid service through the Services step", () => {
  const draft = createOnboardingDraft();
  draft.services = [
    {
      ...createServiceDraft("website"),
      name: "Website",
      url: "https://example.com",
    },
  ];

  assert.deepEqual(validateServicesStep(draft), {});
});

test("carries an optional description into the configuration as SEO copy", () => {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "My Status";
  draft.description = "  Live status for the Velvet Underground platform.  ";
  draft.services = [
    { ...createServiceDraft("website"), name: "Website", url: "https://example.com" },
  ];

  const result = buildSetupRequest(draft);

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(
    result.request.configuration.statusPage.seo?.description,
    "Live status for the Velvet Underground platform.",
  );
});

test("omits the description entirely when it is blank", () => {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "My Status";
  draft.description = "   ";
  draft.services = [
    { ...createServiceDraft("website"), name: "Website", url: "https://example.com" },
  ];

  const result = buildSetupRequest(draft);

  // Not an empty string. The contract requires at least one character, so
  // writing one would fail the whole configuration over a field left blank.
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal("seo" in result.request.configuration.statusPage, false);
});

test("rejects exactly the fields that carry the required mark", () => {
  const complete = () => {
    const draft = createOnboardingDraft();
    draft.repositoryOwner = "velvet-user";
    draft.repositoryName = "status";
    draft.statusPageName = "My Status";
    draft.services = [
      { ...createServiceDraft("website"), name: "Website", url: "https://example.com" },
    ];
    return draft;
  };

  // The mark promises the step will not let you past. Anything wearing it has
  // to be rejected here, and anything rejected here has to wear it, or the
  // form teaches a rule it does not keep.
  const required: [string, (draft: OnboardingDraft) => Record<string, string>][] = [
    ["repositoryOwner", (draft) => { draft.repositoryOwner = ""; return validateBasicsStep(draft); }],
    ["repositoryName", (draft) => { draft.repositoryName = ""; return validateBasicsStep(draft); }],
    ["statusPageName", (draft) => { draft.statusPageName = ""; return validateBasicsStep(draft); }],
    ["services.0.name", (draft) => { draft.services[0]!.name = ""; return validateServicesStep(draft); }],
    ["services.0.url", (draft) => { draft.services[0]!.url = ""; return validateServicesStep(draft); }],
    ["services.0.expectedStatusCodes", (draft) => {
      draft.services[0]!.expectedStatusCodes = "";
      return validateServicesStep(draft);
    }],
  ];
  for (const [field, empty] of required) {
    const errors = empty(complete());
    assert.ok(errors[field], `${field} is marked required and must be rejected when empty`);
  }

  // The two that are not marked, and must not be. Both have contract defaults.
  const optional = complete();
  optional.customDomain = "";
  optional.description = "";
  assert.deepEqual(validateBasicsStep(optional), {});
});

test("writes no gallery consent for a visitor who never gave one", () => {
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
  assert.deepEqual(result.request.configuration.gallery, { listed: false });
});

test("carries a ticked gallery consent into the written configuration", () => {
  const draft = createOnboardingDraft();
  draft.repositoryOwner = "velvet-user";
  draft.repositoryName = "status";
  draft.statusPageName = "My Status";
  draft.listInGallery = true;
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
  assert.deepEqual(result.request.configuration.gallery, { listed: true });
});
