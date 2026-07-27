import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CONTRACT_SCHEMA_VERSION,
  IncidentsDocumentSchema,
  ResponseTimesDocumentSchema,
  StatusDocumentSchema,
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
