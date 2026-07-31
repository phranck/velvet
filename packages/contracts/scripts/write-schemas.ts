import { mkdir, writeFile } from "node:fs/promises";

import {
  IncidentsDocumentSchema,
  ResponseTimesDocumentSchema,
  StatusDocumentSchema,
} from "../src/schemas.js";
import { VelvetConfigurationSchema } from "../src/configuration/schemas.js";
import {
  VelvetReleaseManifestSchema,
  VelvetVersionLockSchema,
} from "../src/updates/schemas.js";

const dataOutputDirectory = new URL(
  "../schemas/velvet-data/v1/",
  import.meta.url,
);
const configurationOutputDirectory = new URL(
  "../schemas/velvet-config/v1/",
  import.meta.url,
);
const updateOutputDirectory = new URL(
  "../schemas/velvet-update/v1/",
  import.meta.url,
);

await Promise.all([
  mkdir(dataOutputDirectory, { recursive: true }),
  mkdir(configurationOutputDirectory, { recursive: true }),
  mkdir(updateOutputDirectory, { recursive: true }),
]);

const schemas = {
  data: {
    "status.schema.json": StatusDocumentSchema,
    "response-times.schema.json": ResponseTimesDocumentSchema,
    "incidents.schema.json": IncidentsDocumentSchema,
  },
  configuration: {
    "config.schema.json": VelvetConfigurationSchema,
  },
  update: {
    "lock.schema.json": VelvetVersionLockSchema,
    "release-manifest.schema.json": VelvetReleaseManifestSchema,
  },
};

await Promise.all(
  [
    ...Object.entries(schemas.data).map(([fileName, schema]) =>
      writeFile(
        new URL(fileName, dataOutputDirectory),
        `${JSON.stringify(schema, null, 2)}\n`,
        "utf8",
      ),
    ),
    ...Object.entries(schemas.configuration).map(([fileName, schema]) =>
      writeFile(
        new URL(fileName, configurationOutputDirectory),
        `${JSON.stringify(schema, null, 2)}\n`,
        "utf8",
      ),
    ),
    ...Object.entries(schemas.update).map(([fileName, schema]) =>
      writeFile(
        new URL(fileName, updateOutputDirectory),
        `${JSON.stringify(schema, null, 2)}\n`,
        "utf8",
      ),
    ),
  ],
);
