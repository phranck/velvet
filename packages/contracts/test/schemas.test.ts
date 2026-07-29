import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "bun:test";

import {
  CONFIGURATION_SCHEMA_VERSION,
  CONTRACT_SCHEMA_VERSION,
  IncidentsDocumentSchema,
  ResponseTimesDocumentSchema,
  StatusDocumentSchema,
  VelvetConfigurationSchema,
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

  const schema = JSON.stringify(VelvetConfigurationSchema).toLowerCase();
  assert.equal(schema.includes("upptime"), false);
  assert.equal(schema.includes("globalping"), false);
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
