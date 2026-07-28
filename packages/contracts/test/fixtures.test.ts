import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "bun:test";

import {
  type ContractValidationErrorCode,
  validateIncidentsDocument,
  validateResponseTimesDocument,
  validateStatusDocument,
} from "../src/index.js";

type Validator = (value: unknown) => { success: boolean; errors?: unknown[] };

const readFixture = (path: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/${path}`, import.meta.url), "utf8"),
  );

const validFixtures: Array<[string, Validator]> = [
  ["valid/status/dual-stack.json", validateStatusDocument],
  ["valid/status/ipv4-only.json", validateStatusDocument],
  ["valid/status/partial-history.json", validateStatusDocument],
  ["valid/status/no-data.json", validateStatusDocument],
  ["valid/response-times/with-unavailable.json", validateResponseTimesDocument],
  ["valid/response-times/no-data.json", validateResponseTimesDocument],
  ["valid/incidents/incident.json", validateIncidentsDocument],
  ["valid/incidents/maintenance.json", validateIncidentsDocument],
];

for (const [path, validate] of validFixtures) {
  test(`valid fixture: ${path}`, () => {
    const fixture = readFixture(path);
    assert.deepEqual(validate(fixture), { success: true, data: fixture });

    const publicData = JSON.stringify(fixture).toLowerCase();
    assert.equal(publicData.includes("upptime"), false);
    assert.equal(publicData.includes("/health"), false);
    assert.equal(publicData.includes("http://"), false);
    assert.equal(publicData.includes("https://"), false);
  });
}

const invalidFixtures: Array<[string, Validator, ContractValidationErrorCode]> = [
  [
    "invalid/status/unsupported-version.json",
    validateStatusDocument,
    "UNSUPPORTED_SCHEMA_VERSION",
  ],
  [
    "invalid/status/duplicate-service.json",
    validateStatusDocument,
    "DUPLICATE_SERVICE_ID",
  ],
  [
    "invalid/status/duplicate-check.json",
    validateStatusDocument,
    "DUPLICATE_CHECK_ID",
  ],
  [
    "invalid/status/invalid-protocol.json",
    validateStatusDocument,
    "INVALID_PROTOCOL",
  ],
  [
    "invalid/status/impossible-timestamp.json",
    validateStatusDocument,
    "INVALID_TIMESTAMP",
  ],
  [
    "invalid/status/negative-duration.json",
    validateStatusDocument,
    "NEGATIVE_DURATION",
  ],
  [
    "invalid/status/pre-monitoring-history.json",
    validateStatusDocument,
    "TIMESTAMP_OUT_OF_RANGE",
  ],
  [
    "invalid/status/oversized-partial-first-day.json",
    validateStatusDocument,
    "INVALID_DURATION_RANGE",
  ],
  [
    "invalid/status/oversized-partial-current-day.json",
    validateStatusDocument,
    "INVALID_DURATION_RANGE",
  ],
  [
    "invalid/response-times/duplicate-series.json",
    validateResponseTimesDocument,
    "DUPLICATE_RESPONSE_SERIES",
  ],
  [
    "invalid/incidents/invalid-window.json",
    validateIncidentsDocument,
    "TIMESTAMP_OUT_OF_RANGE",
  ],
  [
    "invalid/incidents/scheduled-already-started.json",
    validateIncidentsDocument,
    "INVALID_EVENT_STATE",
  ],
  [
    "invalid/incidents/active-window-ended.json",
    validateIncidentsDocument,
    "INVALID_EVENT_STATE",
  ],
  [
    "invalid/incidents/completed-window-in-future.json",
    validateIncidentsDocument,
    "INVALID_EVENT_STATE",
  ],
];

for (const [path, validate, expectedCode] of invalidFixtures) {
  test(`invalid fixture: ${path}`, () => {
    const fixture = readFixture(path);
    const firstResult = validate(fixture);
    const secondResult = validate(fixture);

    assert.deepEqual(secondResult, firstResult);
    assert.equal(firstResult.success, false);
    assert.equal(
      (firstResult.errors?.[0] as { code?: unknown } | undefined)?.code,
      expectedCode,
    );
  });
}
