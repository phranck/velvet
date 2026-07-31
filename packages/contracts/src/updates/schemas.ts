import { Type, type Static } from "@sinclair/typebox";

export const UPDATE_LOCK_SCHEMA_VERSION = 1 as const;
export const RELEASE_MANIFEST_SCHEMA_VERSION = 1 as const;

export const SEMANTIC_VERSION_PATTERN =
  "^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$";

const SemanticVersionSchema = Type.String({
  minLength: 5,
  maxLength: 128,
  pattern: SEMANTIC_VERSION_PATTERN,
});

const TemplateReferenceSchema = Type.Object(
  {
    repository: Type.String({
      minLength: 3,
      maxLength: 140,
      pattern:
        "^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/[A-Za-z0-9._-]+$",
    }),
    commit: Type.String({ pattern: "^[a-f0-9]{40}$" }),
  },
  { additionalProperties: false },
);

const SchemaVersionSchema = Type.Integer({ minimum: 1 });

export const VelvetVersionLockSchema = Type.Object(
  {
    schemaVersion: Type.Literal(UPDATE_LOCK_SCHEMA_VERSION),
    installedVersion: SemanticVersionSchema,
    template: TemplateReferenceSchema,
    configurationSchemaVersion: SchemaVersionSchema,
    dataSchemaVersion: SchemaVersionSchema,
  },
  {
    $id: "urn:velvet:schema:update-lock:v1",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    description:
      "Deterministic record of the Velvet template version installed in a status repository.",
  },
);

const ManagedPathSchema = Type.String({ minLength: 1, maxLength: 256 });

const ReplacedFileSchema = Type.Object(
  {
    path: ManagedPathSchema,
    strategy: Type.Literal("replace"),
    sourcePath: ManagedPathSchema,
    sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  },
  { additionalProperties: false },
);

export const SOURCE_TEMPLATE_GENERATORS = [
  "maintenance-issue-template-v1",
  "maintenance-workflow-v1",
  "pages-workflow-v1",
  "response-times-workflow-v1",
  "status-workflow-v1",
] as const;

export const TEMPLATE_GENERATORS = [
  ...SOURCE_TEMPLATE_GENERATORS,
  "version-lock-v1",
] as const;

const SourceGeneratorSchema = Type.Union(
  SOURCE_TEMPLATE_GENERATORS.map((generator) => Type.Literal(generator)),
);

const SourceGeneratedFileSchema = Type.Object(
  {
    path: ManagedPathSchema,
    strategy: Type.Literal("generate"),
    generator: SourceGeneratorSchema,
    sourcePath: ManagedPathSchema,
    sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  },
  { additionalProperties: false },
);

const VersionLockFileSchema = Type.Object(
  {
    path: Type.Literal("velvet.lock.json"),
    strategy: Type.Literal("generate"),
    generator: Type.Literal("version-lock-v1"),
  },
  { additionalProperties: false },
);

export const VelvetReleaseManifestSchema = Type.Object(
  {
    schemaVersion: Type.Literal(RELEASE_MANIFEST_SCHEMA_VERSION),
    version: SemanticVersionSchema,
    releaseType: Type.Union([
      Type.Literal("security"),
      Type.Literal("fix"),
      Type.Literal("feature"),
    ]),
    automaticInstallEligible: Type.Boolean(),
    template: TemplateReferenceSchema,
    compatibility: Type.Object(
      {
        minimumInstalledVersion: SemanticVersionSchema,
        configurationSchemaVersion: SchemaVersionSchema,
        dataSchemaVersion: SchemaVersionSchema,
        configurationMigrationRequired: Type.Boolean(),
        dataMigrationRequired: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    managedFiles: Type.Array(
      Type.Union([
        ReplacedFileSchema,
        SourceGeneratedFileSchema,
        VersionLockFileSchema,
      ]),
      { minItems: 1, maxItems: 32 },
    ),
    releaseNotes: Type.String({ minLength: 1, maxLength: 65_536 }),
  },
  {
    $id: "urn:velvet:schema:release-manifest:v1",
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: false,
    description:
      "Immutable update metadata consumed by the Velvet managed-update service and Configurator.",
  },
);

export type VelvetVersionLock = Static<typeof VelvetVersionLockSchema>;
export type VelvetReleaseManifest = Static<
  typeof VelvetReleaseManifestSchema
>;
export type VelvetManagedFile = VelvetReleaseManifest["managedFiles"][number];
export type VelvetTemplateGenerator = (typeof TEMPLATE_GENERATORS)[number];
