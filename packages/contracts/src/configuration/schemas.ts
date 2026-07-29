import { Type, type Static } from "@sinclair/typebox";

export const CONFIGURATION_SCHEMA_VERSION = 1 as const;

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
const HexColorSchema = Type.String({ pattern: "^#[0-9a-fA-F]{6}$" });
const PaletteKeySchema = Type.Union([
  Type.Literal("canvas"),
  Type.Literal("foreground"),
  Type.Literal("accent"),
  Type.Literal("alternate"),
  Type.Literal("warning"),
  Type.Literal("danger"),
  Type.Literal("textPrimary"),
  Type.Literal("textSecondary"),
  Type.Literal("textTertiary"),
]);
const ColorSourceSchema = Type.Union([
  Type.Literal("auto"),
  PaletteKeySchema,
  HexColorSchema,
]);

const ThemePaletteSchema = Type.Object(
  {
    canvas: Type.Optional(HexColorSchema),
    foreground: Type.Optional(HexColorSchema),
    accent: Type.Optional(HexColorSchema),
    alternate: Type.Optional(HexColorSchema),
    warning: Type.Optional(HexColorSchema),
    danger: Type.Optional(HexColorSchema),
    textPrimary: Type.Optional(HexColorSchema),
    textSecondary: Type.Optional(HexColorSchema),
    textTertiary: Type.Optional(HexColorSchema),
  },
  { additionalProperties: false },
);

const ThemeSchema = Type.Object(
  {
    name: ShortTextSchema,
    palette: Type.Optional(ThemePaletteSchema),
    grid: Type.Optional(
      Type.Object(
        {
          operational: Type.Optional(ColorSourceSchema),
          degraded: Type.Optional(ColorSourceSchema),
          outage: Type.Optional(ColorSourceSchema),
          noData: Type.Optional(ColorSourceSchema),
        },
        { additionalProperties: false },
      ),
    ),
    chart: Type.Optional(
      Type.Object(
        {
          line: Type.Optional(ColorSourceSchema),
          lineStyle: Type.Optional(
            Type.Union([
              Type.Literal("solid"),
              Type.Literal("dashed"),
              Type.Literal("dotted"),
            ]),
          ),
          fill: Type.Optional(Type.Boolean()),
          background: Type.Optional(ColorSourceSchema),
          backgroundOpacity: Type.Optional(
            Type.Number({ minimum: 0, maximum: 1 }),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    background: Type.Optional(
      Type.Object(
        {
          start: Type.Optional(ColorSourceSchema),
          end: Type.Optional(ColorSourceSchema),
          blobs: Type.Optional(
            Type.Object(
              {
                enabled: Type.Optional(Type.Boolean()),
                count: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
                colors: Type.Optional(
                  Type.Tuple([ColorSourceSchema, ColorSourceSchema]),
                ),
              },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    card: Type.Optional(
      Type.Object(
        {
          background: Type.Optional(ColorSourceSchema),
          border: Type.Optional(ColorSourceSchema),
          separator: Type.Optional(ColorSourceSchema),
          borderEnabled: Type.Optional(Type.Boolean()),
          shadowEnabled: Type.Optional(Type.Boolean()),
          radius: Type.Optional(Type.Integer({ minimum: 0, maximum: 32 })),
          padding: Type.Optional(Type.Integer({ minimum: 0, maximum: 32 })),
          maxWidth: Type.Optional(
            Type.Union([
              Type.Literal(640),
              Type.Literal(760),
              Type.Literal(920),
              Type.Literal(1080),
            ]),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    headline: Type.Optional(
      Type.Object(
        {
          start: Type.Optional(ColorSourceSchema),
          end: Type.Optional(ColorSourceSchema),
        },
        { additionalProperties: false },
      ),
    ),
    service: Type.Optional(
      Type.Object(
        { icon: Type.Optional(ColorSourceSchema) },
        { additionalProperties: false },
      ),
    ),
    text: Type.Optional(
      Type.Object(
        {
          primary: Type.Optional(ColorSourceSchema),
          secondary: Type.Optional(ColorSourceSchema),
          tertiary: Type.Optional(ColorSourceSchema),
        },
        { additionalProperties: false },
      ),
    ),
  },
  {
    additionalProperties: false,
    description:
      "Presentation theme. Setup writes a complete system theme; hand-written files may override selected roles.",
  },
);

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
        pattern:
          "^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,63}$",
      }),
    ),
    logoUrl: Type.Optional(UrlSchema),
    logoHeight: Type.Optional(Type.Integer({ minimum: 16, maximum: 256 })),
    showPoweredBy: Type.Optional(Type.Boolean()),
    layout: Type.Optional(
      Type.Union([Type.Literal("grouped"), Type.Literal("cards")]),
    ),
    defaultRange: Type.Optional(
      Type.Union([
        Type.Literal("24h"),
        Type.Literal("7d"),
        Type.Literal("30d"),
        Type.Literal("90d"),
        Type.Literal("1yr"),
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
    theme: Type.Optional(ThemeSchema),
    fonts: Type.Optional(
      Type.Object(
        {
          sans: Type.Optional(ShortTextSchema),
          mono: Type.Optional(ShortTextSchema),
        },
        { additionalProperties: false },
      ),
    ),
    icons: Type.Optional(Type.Record(IdentifierSchema, ShortTextSchema)),
    analytics: Type.Optional(
      Type.Object(
        {
          umami: Type.Optional(
            Type.Object(
              { websiteId: ShortTextSchema, src: UrlSchema },
              { additionalProperties: false },
            ),
          ),
          googleAnalytics: Type.Optional(
            Type.String({ pattern: "^G-[A-Z0-9]+$" }),
          ),
        },
        { additionalProperties: false },
      ),
    ),
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
            Type.Integer({ minimum: 1, maximum: 3_650 }),
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
export type VelvetThemeInput = Static<typeof ThemeSchema>;
