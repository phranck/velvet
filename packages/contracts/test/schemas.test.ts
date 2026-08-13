import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "bun:test";

import {
  CONFIGURATION_SCHEMA_VERSION,
  CONTRACT_SCHEMA_VERSION,
  IncidentsDocumentSchema,
  RELEASE_MANIFEST_SCHEMA_VERSION,
  ResponseTimesDocumentSchema,
  StatusDocumentSchema,
  UPDATE_LOCK_SCHEMA_VERSION,
  VelvetConfigurationSchema,
  VelvetReleaseManifestSchema,
  VelvetVersionLockSchema,
  validateVelvetConfiguration,
} from "../src/index.js";

test("all public documents require the same explicit schema version", () => {
  assert.equal(CONTRACT_SCHEMA_VERSION, 1);

  for (const schema of [
    StatusDocumentSchema,
    ResponseTimesDocumentSchema,
    IncidentsDocumentSchema,
  ]) {
    assert.equal(schema.properties.schemaVersion.const, CONTRACT_SCHEMA_VERSION);
    assert.equal(schema.additionalProperties, false);
  }
});

test("configuration has its own explicit schema without monitor-provider fields", () => {
  assert.equal(CONFIGURATION_SCHEMA_VERSION, 1);
  assert.equal(
    VelvetConfigurationSchema.properties.schemaVersion.const,
    CONFIGURATION_SCHEMA_VERSION,
  );
  assert.equal(VelvetConfigurationSchema.additionalProperties, false);

  // The names of other products are checked for across the whole repository by
  // `site/test/standalone-product.test.ts`, which is the one file allowed to
  // state them.
  const schema = JSON.stringify(VelvetConfigurationSchema).toLowerCase();
  assert.equal(schema.includes("provider"), false);
  assert.equal(schema.includes("ipv6"), false);
});

test("published JSON Schema files match the TypeScript schema source", () => {
  const schemas = {
    "status.schema.json": StatusDocumentSchema,
    "response-times.schema.json": ResponseTimesDocumentSchema,
    "incidents.schema.json": IncidentsDocumentSchema,
  };

  for (const [fileName, schema] of Object.entries(schemas)) {
    const publishedSchema = JSON.parse(
      readFileSync(
        new URL(`../schemas/velvet-data/v1/${fileName}`, import.meta.url),
        "utf8",
      ),
    );
    assert.deepEqual(publishedSchema, JSON.parse(JSON.stringify(schema)));
  }
});

test("published configuration schema matches the TypeScript schema source", () => {
  const schemaUrl = new URL(
    "../schemas/velvet-config/v1/config.schema.json",
    import.meta.url,
  );
  assert.equal(
    existsSync(schemaUrl),
    true,
    "the generated Velvet configuration schema must exist",
  );
  const publishedSchema = JSON.parse(
    readFileSync(schemaUrl, "utf8"),
  );
  assert.deepEqual(
    publishedSchema,
    JSON.parse(JSON.stringify(VelvetConfigurationSchema)),
  );
});

test("published update schemas match their TypeScript schema sources", () => {
  assert.equal(UPDATE_LOCK_SCHEMA_VERSION, 1);
  assert.equal(RELEASE_MANIFEST_SCHEMA_VERSION, 1);

  for (const [fileName, schema] of Object.entries({
    "lock.schema.json": VelvetVersionLockSchema,
    "release-manifest.schema.json": VelvetReleaseManifestSchema,
  })) {
    const schemaUrl = new URL(
      `../schemas/velvet-update/v1/${fileName}`,
      import.meta.url,
    );
    assert.equal(existsSync(schemaUrl), true, `${fileName} must exist`);
    assert.deepEqual(
      JSON.parse(readFileSync(schemaUrl, "utf8")),
      JSON.parse(JSON.stringify(schema)),
    );
  }
});

/**
 * A value for every status-page field the schema declares, so the normalizer
 * can be asked to carry all of them at once.
 *
 * A field added to the schema without a value here fails the check below, which
 * is what keeps this list complete.
 */
const EVERY_STATUS_PAGE_FIELD: Record<string, unknown> = {
  name: "Example Status",
  customDomain: "status.example.com",
  design: "cassette",
  layout: "cards",
  defaultRange: "90d",
  logoHeight: 96,
  logoUrl: "./logo.svg",
  navigation: [{ title: "Home", href: "https://example.com" }],
  icons: { website: "ph-globe" },
  theme: { name: "Custom" },
  fonts: { sans: "Inter", mono: "Fira Code" },
  seo: { description: "Live service status." },
};

/**
 * The normalizer builds the status page field by field, so a field the schema
 * accepts and it does not copy is dropped between what somebody writes and what
 * gets published. `design` was dropped that way, and an installation naming one
 * published the page Velvet ships instead.
 */
test("the normalizer carries every status-page field the schema declares", () => {
  const declared = Object.keys(
    VelvetConfigurationSchema.properties.statusPage.properties,
  );
  assert.deepEqual(
    declared.filter((field) => !(field in EVERY_STATUS_PAGE_FIELD)),
    [],
    "a status-page field the schema declares has no value in this test",
  );

  const result = validateVelvetConfiguration({
    schemaVersion: 1,
    repository: { owner: "example", name: "status" },
    statusPage: EVERY_STATUS_PAGE_FIELD,
    services: [{ name: "Website", url: "https://example.com" }],
  } as never);

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(
    declared.filter((field) => !(field in result.data.statusPage)),
    [],
    "the normalizer dropped a field the schema declares",
  );
});
