import { Type, type Static } from "@sinclair/typebox";

export const CONFIGURATION_SCHEMA_VERSION = 1 as const;
export const CUSTOM_DOMAIN_PATTERN =
  "^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,63}$";

const configurationSchemaOptions = {
  $id: "urn:velvet:schema:configuration:v1",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  description:
    "Canonical configuration for a GitHub-native Velvet status repository.",
};

const IdentifierSchema = Type.String({
  minLength: 1,
  maxLength: 64,
  pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$",
  description: "Stable lowercase kebab-case identifier.",
});

const ShortTextSchema = Type.String({ minLength: 1, maxLength: 128 });
const UrlSchema = Type.String({ minLength: 1, maxLength: 2_048 });
const SecretHeaderSchema = Type.Object(
  {
    name: Type.String({
      minLength: 1,
      maxLength: 128,
      description: "HTTP header name.",
    }),
    secret: Type.String({
      minLength: 1,
      maxLength: 128,
      description:
        "Environment-variable name containing the header value. Secret values never belong in velvet.yml.",
    }),
  },
  { additionalProperties: false },
);

const JsonAssertionValueSchema = Type.Union([
  Type.String({ maxLength: 1_024 }),
  Type.Number(),
  Type.Boolean(),
  Type.Null(),
]);

const JsonAssertionSchema = Type.Object(
  {
    path: Type.String({
      minLength: 1,
      maxLength: 256,
      description: "RFC 6901 JSON Pointer identifying the response value.",
    }),
    equals: JsonAssertionValueSchema,
  },
  {
    additionalProperties: false,
    description:
      "Optional explicit JSON health assertion. Status-only checks do not inspect the response body.",
  },
);

const HttpCheckSchema = Type.Object(
  {
    id: Type.Optional(IdentifierSchema),
    name: ShortTextSchema,
    url: UrlSchema,
    method: Type.Optional(
      Type.String({
        description: "Safe HTTP method. Velvet supports GET and HEAD.",
      }),
    ),
    expectedStatusCodes: Type.Optional(
      Type.Array(Type.Integer(), {
        minItems: 1,
        maxItems: 32,
        uniqueItems: true,
        description:
          "Final HTTP status codes that count as healthy. Defaults to only 200.",
      }),
    ),
    maxRedirects: Type.Optional(
      Type.Integer({
        minimum: 0,
        maximum: 10,
        description: "Maximum followed redirects. Defaults to 5.",
      }),
    ),
    timeoutMs: Type.Optional(
      Type.Integer({
        minimum: 100,
        maximum: 60_000,
        description:
          "Absolute request timeout in milliseconds across all redirects. Defaults to 10000.",
      }),
    ),
    headers: Type.Optional(
      Type.Array(SecretHeaderSchema, { maxItems: 16 }),
    ),
    jsonAssertions: Type.Optional(
      Type.Array(JsonAssertionSchema, { maxItems: 16 }),
    ),
  },
  { additionalProperties: false },
);

const ServiceSchema = Type.Object(
  {
    id: Type.Optional(IdentifierSchema),
    name: ShortTextSchema,
    url: Type.Optional(UrlSchema),
    checks: Type.Optional(Type.Array(HttpCheckSchema, { minItems: 1 })),
  },
  {
    additionalProperties: false,
    description:
      "Public service component. Use name plus url for one default check, or checks for multiple named endpoints.",
  },
);

const StatusPageSchema = Type.Object(
  {
    name: ShortTextSchema,
    customDomain: Type.Optional(
      Type.String({
        minLength: 1,
        maxLength: 253,
        pattern: CUSTOM_DOMAIN_PATTERN,
      }),
    ),
    logoUrl: Type.Optional(UrlSchema),
    logoHeight: Type.Optional(Type.Integer({ minimum: 16, maximum: 256 })),
    theme: Type.String({
      minLength: 1,
      maxLength: 64,
      pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$",
      description:
        "The theme the page is published in, named by its directory under site/theme-bundles. Required, because a page is published in a theme and there is nothing to publish without one. A name no installed theme answers to stops the build rather than falling back to another theme.",
    }),
    themeSettings: Type.Optional(
      Type.Record(
        Type.String({ pattern: "^[a-z][a-zA-Z0-9]*$" }),
        Type.Union([Type.String({ maxLength: 128 }), Type.Number(), Type.Boolean()]),
        {
          description:
            "What has been set on the named theme, keyed by the feature it belongs to. Which keys a theme offers and what each may take is in its own velvet-theme.toml, so the build checks these against that file rather than the schema, which does not know which theme was named.",
        },
      ),
    ),
    layout: Type.Optional(
      Type.Union([Type.Literal("grouped"), Type.Literal("cards")]),
    ),
    defaultRange: Type.Optional(
      Type.Union([
        Type.Literal("30d"),
        Type.Literal("90d"),
        Type.Literal("all"),
      ]),
    ),
    navigation: Type.Optional(
      Type.Array(
        Type.Object(
          { title: ShortTextSchema, href: Type.String({ minLength: 1 }) },
          { additionalProperties: false },
        ),
        { maxItems: 16 },
      ),
    ),
    icons: Type.Optional(Type.Record(IdentifierSchema, ShortTextSchema)),
    seo: Type.Optional(
      Type.Object(
        {
          title: Type.Optional(ShortTextSchema),
          description: Type.Optional(
            Type.String({ minLength: 1, maxLength: 300 }),
          ),
          image: Type.Optional(UrlSchema),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const VelvetConfigurationSchema = Type.Object(
  {
    schemaVersion: Type.Literal(CONFIGURATION_SCHEMA_VERSION, {
      description: "Velvet configuration contract version.",
    }),
    repository: Type.Object(
      {
        owner: Type.String({
          minLength: 1,
          maxLength: 39,
          pattern: "^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$",
        }),
        name: Type.String({
          minLength: 1,
          maxLength: 100,
          pattern: "^[A-Za-z0-9._-]+$",
        }),
      },
      { additionalProperties: false },
    ),
    statusPage: StatusPageSchema,
    services: Type.Array(ServiceSchema, { minItems: 1 }),
    incidents: Type.Optional(
      Type.Object(
        {
          failureThreshold: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 20 }),
          ),
          recoveryThreshold: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 20 }),
          ),
          incidentLabel: Type.Optional(IdentifierSchema),
          maintenanceLabel: Type.Optional(IdentifierSchema),
        },
        { additionalProperties: false },
      ),
    ),
    history: Type.Optional(
      Type.Object(
        {
          retentionDays: Type.Optional(
            Type.Integer({ minimum: 1, maximum: 365 }),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    gallery: Type.Optional(
      Type.Object(
        {
          listed: Type.Boolean({
            description:
              "Name this installation as a reference on the Velvet website. Off unless the owner has said otherwise.",
          }),
        },
        { additionalProperties: false },
      ),
    ),
    updates: Type.Optional(
      Type.Object(
        {
          automaticSecurityUpdates: Type.Optional(
            Type.Boolean({
              description:
                "Install compatible security-only releases automatically after their update pull request passes all checks.",
            }),
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  configurationSchemaOptions,
);

export type VelvetConfigurationInput = Static<
  typeof VelvetConfigurationSchema
>;
