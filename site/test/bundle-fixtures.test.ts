import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  validateIncidentsDocument,
  validateResponseTimesDocument,
  validateStatusDocument,
} from "@velvet/contracts";

import { FIXTURES } from "../theme-bundles/fixtures/index.js";

/**
 * The fixtures are checked against the product's own validators rather than the
 * raw schemas, because the validators check what a schema cannot: duplicate
 * identifiers, timestamps outside the document's own window, and durations that
 * contradict each other.
 *
 * A fixture that satisfied the schema but not these would be a document Velvet
 * refuses, and a design proved against it would be proved against nothing.
 */

test("every fixture is a document the product would accept", () => {
  for (const fixture of FIXTURES) {
    for (const [name, validate, document] of [
      ["status", validateStatusDocument, fixture.data.status],
      ["response-times", validateResponseTimesDocument, fixture.data.responseTimes],
      ["incidents", validateIncidentsDocument, fixture.data.incidents],
    ] as const) {
      const result = validate(document);
      assert.equal(
        result.success,
        true,
        `${fixture.name} ${name}: ${result.success ? "" : result.errors.map((error) => `${error.path} ${error.code}`).join(", ")}`,
      );
    }
  }
});

test("the set covers the seven cases the suite exists for", () => {
  const names = FIXTURES.map((fixture) => fixture.name);
  for (const required of [
    "first-day",
    "everything-unknown",
    "one-service",
    "twenty-services",
    "long-names",
    "long-summary",
    "ipv6-only",
  ]) {
    assert.equal(names.includes(required), true, `${required} is missing`);
  }
});

test("the awkward cases really are awkward", () => {
  const by = (name: string) => FIXTURES.find((fixture) => fixture.name === name)!;

  // A first day has one partial day of history and nothing before it.
  const first = by("first-day");
  assert.equal(
    first.data.status.monitoringStartedAt.slice(0, 10),
    first.data.status.generatedAt.slice(0, 10),
  );
  for (const service of first.data.status.services) {
    assert.equal(service.dailyAvailability.length, 1);
  }

  assert.equal(by("twenty-services").data.status.services.length, 20);
  assert.equal(by("one-service").data.status.services.length, 1);

  const longest = Math.max(
    ...by("long-names").data.status.services.map((service) => service.name.length),
  );
  assert.equal(longest >= 55, true, `longest name is ${longest}`);

  const summary = by("long-summary").data.incidents.events[0]?.summary ?? "";
  assert.equal(summary.length, 2_000);

  const ipv6 = by("ipv6-only").data.status.services;
  assert.equal(
    ipv6.every((service) => service.checks.every((check) => check.protocol === "ipv6")),
    true,
  );

  const unknown = by("everything-unknown").data.status.services;
  assert.equal(
    unknown.every((service) => service.status === "unknown"),
    true,
  );
  assert.equal(
    unknown.every((service) => service.dailyAvailability.length === 0),
    true,
  );
});
