import { mkdir, writeFile } from "node:fs/promises";

import {
  IncidentsDocumentSchema,
  ResponseTimesDocumentSchema,
  StatusDocumentSchema,
} from "../src/schemas.js";

const outputDirectory = new URL("../schemas/velvet-data/v1/", import.meta.url);

await mkdir(outputDirectory, { recursive: true });

const schemas = {
  "status.schema.json": StatusDocumentSchema,
  "response-times.schema.json": ResponseTimesDocumentSchema,
  "incidents.schema.json": IncidentsDocumentSchema,
};

await Promise.all(
  Object.entries(schemas).map(([fileName, schema]) =>
    writeFile(
      new URL(fileName, outputDirectory),
      `${JSON.stringify(schema, null, 2)}\n`,
      "utf8",
    ),
  ),
);
