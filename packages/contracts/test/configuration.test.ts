import assert from "node:assert/strict";
import { test } from "bun:test";

import * as contracts from "../src/index.js";

type ConfigurationError = {
  code: string;
  path: string;
  message: string;
};

type ConfigurationResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; errors: ConfigurationError[] };

const parseVelvetConfiguration = Reflect.get(
  contracts,
  "parseVelvetConfiguration",
) as ((source: string) => ConfigurationResult) | undefined;

function parse(source: string): ConfigurationResult {
  if (typeof parseVelvetConfiguration !== "function") {
    assert.fail("@velvet/contracts must expose parseVelvetConfiguration");
  }
  return parseVelvetConfiguration(source);
}

function assertConfigurationError(
  result: ConfigurationResult,
  code: string,
  path: string,
): void {
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.errors[0]?.code, code);
  assert.equal(result.errors[0]?.path, path);
}

test("normalizes a service name and URL into a complete direct HTTP check", () => {
  const result = parse(`
schemaVersion: 1
repository:
  owner: example
  name: status
statusPage:
  name: Example Status
services:
  - name: Website
    url: https://example.com
`);

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data, {
    schemaVersion: 1,
    repository: { owner: "example", name: "status" },
    statusPage: {
      name: "Example Status",
      layout: "grouped",
      defaultRange: "30d",
      logoHeight: 72,
      showPoweredBy: true,
      navigation: [],
      icons: {},
    },
    services: [
      {
        id: "website",
        name: "Website",
        checks: [
          {
            id: "website",
            name: "Website",
            url: "https://example.com/",
            method: "GET",
            expectedStatusCodes: [200],
            maxRedirects: 5,
            headers: [],
            jsonAssertions: [],
          },
        ],
      },
    ],
    incidents: {
      failureThreshold: 2,
      recoveryThreshold: 2,
      incidentLabel: "incident",
      maintenanceLabel: "maintenance",
    },
    history: { retentionDays: 365 },
  });
});

test("normalizes named checks with safe advanced HTTP options", () => {
  const result = parse(`
schemaVersion: 1
repository:
  owner: example
  name: status
statusPage:
  name: Example Status
services:
  - id: api
    name: API
    checks:
      - name: Readiness
        url: https://api.example.com/ready?full=true
        method: GET
        expectedStatusCodes: [200, 204]
        maxRedirects: 2
        headers:
          - name: Authorization
            secret: API_HEALTH_TOKEN
        jsonAssertions:
          - path: /status
            equals: ok
`);

  assert.equal(result.success, true);
  if (!result.success) return;
  const services = result.data.services as Array<Record<string, unknown>>;
  const checks = services[0]?.checks as Array<Record<string, unknown>>;
  assert.deepEqual(checks[0], {
    id: "readiness",
    name: "Readiness",
    url: "https://api.example.com/ready?full=true",
    method: "GET",
    expectedStatusCodes: [200, 204],
    maxRedirects: 2,
    headers: [{ name: "Authorization", secret: "API_HEALTH_TOKEN" }],
    jsonAssertions: [{ path: "/status", equals: "ok" }],
  });
});

test("rejects duplicate derived service identifiers", () => {
  const result = parse(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - { name: API EU, url: https://eu.example.com }
  - { name: API (EU), url: https://other.example.com }
`);

  assertConfigurationError(
    result,
    "DUPLICATE_CONFIGURATION_SERVICE_ID",
    "/services/1/id",
  );
});

test("rejects a service that mixes the minimal and named-check forms", () => {
  const result = parse(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - name: Website
    url: https://example.com
    checks:
      - { name: Origin, url: https://origin.example.com }
`);

  assertConfigurationError(
    result,
    "INVALID_SERVICE_CHECKS",
    "/services/0",
  );
});

test("rejects non-HTTP URLs and URLs containing credentials", () => {
  for (const url of ["ftp://example.com", "https://user:secret@example.com"]) {
    const result = parse(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - { name: Website, url: ${url} }
`);
    assertConfigurationError(
      result,
      "INVALID_CONFIGURATION_URL",
      "/services/0/url",
    );
  }
});

test("rejects unsupported methods and status codes with stable errors", () => {
  const methodResult = parse(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - name: Website
    checks:
      - { name: Write, url: https://example.com, method: POST }
`);
  assertConfigurationError(
    methodResult,
    "UNSUPPORTED_CONFIGURATION_METHOD",
    "/services/0/checks/0/method",
  );

  const statusResult = parse(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - name: Website
    checks:
      - name: Origin
        url: https://example.com
        expectedStatusCodes: [99]
`);
  assertConfigurationError(
    statusResult,
    "UNSUPPORTED_CONFIGURATION_STATUS_CODE",
    "/services/0/checks/0/expectedStatusCodes/0",
  );
});

test("rejects unsafe JSON pointers", () => {
  const result = parse(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - name: API
    checks:
      - name: Health
        url: https://api.example.com/health
        jsonAssertions:
          - { path: /__proto__/ready, equals: true }
`);

  assertConfigurationError(
    result,
    "UNSAFE_JSON_ASSERTION",
    "/services/0/checks/0/jsonAssertions/0/path",
  );
});

test("rejects JSON assertions on a bodyless HEAD check", () => {
  const result = parse(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - name: API
    checks:
      - name: Health
        url: https://api.example.com/health
        method: HEAD
        jsonAssertions:
          - { path: /status, equals: ok }
`);

  assertConfigurationError(
    result,
    "INCOMPATIBLE_CHECK_OPTIONS",
    "/services/0/checks/0/jsonAssertions",
  );
});

test("rejects interpolation and never echoes the supplied value", () => {
  const secretValue = "DO_NOT_ECHO_THIS_VALUE";
  const result = parse(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - name: API
    checks:
      - name: Health
        url: https://api.example.com/health
        headers:
          - { name: Authorization, value: "Bearer ${secretValue}" }
`);

  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(JSON.stringify(result.errors).includes(secretValue), false);
});

test("rejects environment-variable interpolation in configuration strings", () => {
  const result = parse(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - { name: API, url: "https://api.example.com/\${HEALTH_TOKEN}" }
`);

  assertConfigurationError(
    result,
    "FORBIDDEN_SECRET_INTERPOLATION",
    "/services/0/url",
  );
});

test("rejects unknown fields and incompatible schema versions", () => {
  const unknownResult = parse(`
schemaVersion: 1
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - { name: Website, url: https://example.com, provider: remote }
`);
  assertConfigurationError(
    unknownResult,
    "INVALID_CONFIGURATION",
    "/services/0/provider",
  );

  const versionResult = parse(`
schemaVersion: 2
repository: { owner: example, name: status }
statusPage: { name: Example Status }
services:
  - { name: Website, url: https://example.com }
`);
  assertConfigurationError(
    versionResult,
    "UNSUPPORTED_CONFIGURATION_VERSION",
    "/schemaVersion",
  );
});
