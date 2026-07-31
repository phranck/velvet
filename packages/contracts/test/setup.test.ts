import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  serializeVelvetConfiguration,
  validateSetupEvent,
  validateSetupRequest,
  validateSetupSession,
  validateSetupStatus,
} from "../src/index.js";

const configuration = {
  schemaVersion: 1,
  repository: { owner: "example", name: "status" },
  statusPage: { name: "Example Status" },
  services: [{ name: "Website", url: "https://example.com" }],
  history: { retentionDays: 365 },
} as const;

test("validates and normalizes the only accepted setup request", () => {
  const result = validateSetupRequest({ configuration });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.configuration.repository.name, "status");
  assert.equal(result.data.configuration.services[0]?.checks[0]?.method, "GET");
  assert.deepEqual(
    result.data.configuration.services[0]?.checks[0]?.expectedStatusCodes,
    [200],
  );
});

test("normalizes a custom domain and rejects non-hostname input", () => {
  const valid = validateSetupRequest({
    configuration: {
      ...configuration,
      statusPage: {
        ...configuration.statusPage,
        customDomain: "Status.Example.COM",
      },
    },
  });

  assert.equal(valid.success, true);
  if (!valid.success) return;
  assert.equal(
    valid.data.configuration.statusPage.customDomain,
    "status.example.com",
  );

  for (const customDomain of [
    "https://status.example.com",
    "status.example.com/path",
    "status.example.com:443",
    "user@status.example.com",
    "*.example.com",
  ]) {
    assert.equal(
      validateSetupRequest({
        configuration: {
          ...configuration,
          statusPage: { ...configuration.statusPage, customDomain },
        },
      }).success,
      false,
      customDomain,
    );
  }
});

test("rejects arbitrary setup operations and paths", () => {
  const result = validateSetupRequest({
    configuration,
    files: [{ path: ".github/workflows/unsafe.yml", content: "unsafe" }],
  });

  assert.deepEqual(result, {
    success: false,
    errors: [
      {
        code: "INVALID_SETUP_REQUEST",
        path: "/files",
        message: "Setup request does not match the supported contract.",
      },
    ],
  });
});

test("serializes a validated configuration as canonical YAML", () => {
  const request = validateSetupRequest({ configuration });
  assert.equal(request.success, true);
  if (!request.success) return;

  const source = serializeVelvetConfiguration(request.data.configuration);

  assert.match(source, /^schemaVersion: 1\n/);
  assert.match(source, /repository:\n {2}owner: example\n {2}name: status\n/);
  assert.match(source, /expectedStatusCodes:\n {10}- 200\n/);
  assert.match(source, /updates:\n {2}automaticSecurityUpdates: true\n/);
  assert.doesNotMatch(source, /\.github|!!js|\$\{/);
  assert.equal(source.endsWith("\n"), true);
});

test("pins safe public session, progress, status, and error envelopes", () => {
  assert.equal(
    validateSetupSession({
      authenticated: true,
      csrfToken: "A".repeat(43),
      user: { login: "example", avatarUrl: "https://avatars.githubusercontent.com/u/1" },
      installation: {
        id: 12,
        accountLogin: "example",
        accountType: "User",
        repositorySelection: "selected",
      },
    }).success,
    true,
  );
  assert.equal(
    validateSetupEvent({
      type: "error",
      error: {
        code: "GITHUB_RATE_LIMITED",
        message: "GitHub temporarily limited setup requests. Try again later.",
        errorId: "01J00000000000000000000000",
      },
      recoverable: true,
      repositoryUrl: "https://github.com/example/status",
      workflowRunId: 777,
    }).success,
    true,
  );
  assert.equal(
    validateSetupEvent({
      type: "error",
      error: {
        code: "WORKFLOW_FAILED",
        message: "The initial workflow failed.",
        errorId: "01J00000000000000000000000",
      },
      recoverable: true,
      repositoryUrl: "javascript:alert(1)",
      workflowRunId: 777,
    }).success,
    false,
  );
  assert.equal(
    validateSetupStatus({
      operationId: "01J00000000000000000000000",
      state: "running",
      stage: "enabling-pages",
    }).success,
    true,
  );
  assert.equal(
    validateSetupStatus({
      operationId: "01J00000000000000000000000",
      state: "failed",
      stage: "building-page",
      recoverable: true,
      error: {
        code: "WORKFLOW_FAILED",
        message: "The initial workflow failed.",
        errorId: "01J00000000000000000000000",
      },
    }).success,
    true,
  );
  for (const stage of [
    "checking-services",
    "publishing-data",
    "building-page",
    "deploying-page",
  ]) {
    assert.equal(
      validateSetupEvent({ type: "progress", stage }).success,
      true,
      stage,
    );
  }
  assert.equal(
    validateSetupEvent({
      type: "permission-required",
      access: "temporary-account",
      installationUrl:
        "https://github.com/apps/velvet-setup/installations/new/permissions?state=abc",
      error: {
        code: "INSTALLATION_REQUIRED",
        message: "Install Velvet before continuing.",
        errorId: "01J00000000000000000000000",
      },
    }).success,
    true,
  );
  assert.equal(
    validateSetupEvent({
      type: "success",
      installationUrl: "javascript:alert(1)",
      repositoryUrl: "https://github.com/example/status",
    }).success,
    false,
  );
});
