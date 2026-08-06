import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "bun:test";

import {
  type ConfigurationValidationErrorCode,
  parseVelvetConfiguration,
} from "../src/index.js";

const fixtureUrl = (kind: "valid" | "invalid", name: string): URL =>
  new URL(`../fixtures/${kind}/configuration/${name}.yml`, import.meta.url);

const validFixtures = [
  "minimal-website",
  "multiple-services",
  "advanced-status-code",
  "json-health",
  "incident-policy",
  "maintenance-policy",
  "full-configuration",
] as const;

for (const name of validFixtures) {
  test(`valid configuration fixture: ${name}`, () => {
    const url = fixtureUrl("valid", name);
    assert.equal(existsSync(url), true, `missing valid fixture ${name}`);
    const result = parseVelvetConfiguration(readFileSync(url, "utf8"));
    assert.equal(result.success, true);
  });
}

const invalidFixtures: Array<
  [string, ConfigurationValidationErrorCode, string]
> = [
  ["unsupported-version", "UNSUPPORTED_CONFIGURATION_VERSION", "/schemaVersion"],
  [
    "duplicate-service",
    "DUPLICATE_CONFIGURATION_SERVICE_ID",
    "/services/1/id",
  ],
  [
    "duplicate-check",
    "DUPLICATE_CONFIGURATION_CHECK_ID",
    "/services/0/checks/1/id",
  ],
  ["invalid-url", "INVALID_CONFIGURATION_URL", "/services/0/url"],
  [
    "unsupported-method",
    "UNSUPPORTED_CONFIGURATION_METHOD",
    "/services/0/checks/0/method",
  ],
  [
    "invalid-status-code",
    "UNSUPPORTED_CONFIGURATION_STATUS_CODE",
    "/services/0/checks/0/expectedStatusCodes/0",
  ],
  [
    "unsafe-json-assertion",
    "UNSAFE_JSON_ASSERTION",
    "/services/0/checks/0/jsonAssertions/0/path",
  ],
  [
    "secret-interpolation",
    "FORBIDDEN_SECRET_INTERPOLATION",
    "/services/0/checks/0/headers/0/secret",
  ],
  [
    "reserved-secret",
    "RESERVED_SECRET_REFERENCE",
    "/services/0/checks/0/headers/0/secret",
  ],
  ["unknown-field", "INVALID_CONFIGURATION", "/services/0/remoteProbe"],
  ["mixed-service-forms", "INVALID_SERVICE_CHECKS", "/services/0"],
];

for (const [name, expectedCode, expectedPath] of invalidFixtures) {
  test(`invalid configuration fixture: ${name}`, () => {
    const url = fixtureUrl("invalid", name);
    assert.equal(existsSync(url), true, `missing invalid fixture ${name}`);
    const source = readFileSync(url, "utf8");
    const firstResult = parseVelvetConfiguration(source);
    const secondResult = parseVelvetConfiguration(source);

    assert.deepEqual(secondResult, firstResult);
    assert.equal(firstResult.success, false);
    if (firstResult.success) return;
    assert.equal(firstResult.errors[0]?.code, expectedCode);
    assert.equal(firstResult.errors[0]?.path, expectedPath);
  });
}

test("a fully populated configuration gives every service one IPv4-only default check", () => {
  const source = readFileSync(fixtureUrl("valid", "full-configuration"), "utf8");
  const result = parseVelvetConfiguration(source);
  assert.equal(result.success, true);
  if (!result.success) return;

  assert.deepEqual(
    result.data.services.map((service) => service.name),
    ["Website", "Dashboard", "Backend", "Database", "Storage"],
  );
  assert.equal(
    result.data.services.every(
      (service) =>
        service.checks.length === 1 &&
        service.checks[0]?.method === "GET" &&
        service.checks[0]?.expectedStatusCodes.join(",") === "200" &&
        service.checks[0]?.jsonAssertions.length === 0,
    ),
    true,
  );
});
