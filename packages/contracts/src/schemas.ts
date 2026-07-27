import { Type, type Static } from "@sinclair/typebox";

export const CONTRACT_SCHEMA_VERSION = 1 as const;

const schemaOptions = (name: string) => ({
  $id: `urn:velvet:schema:velvet-data:v1:${name}`,
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
});

const IdentifierSchema = Type.String({
  minLength: 1,
  maxLength: 64,
  pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$",
});

const TimestampSchema = Type.String({ minLength: 1 });

const CurrentStatusSchema = Type.Union([
  Type.Literal("operational"),
  Type.Literal("degraded"),
  Type.Literal("outage"),
  Type.Literal("unknown"),
]);

const CheckSchema = Type.Object(
  {
    id: IdentifierSchema,
    protocol: Type.Union([Type.Literal("ipv4"), Type.Literal("ipv6")]),
    status: CurrentStatusSchema,
    checkedAt: Type.Union([TimestampSchema, Type.Null()]),
    responseTimeMs: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

const DailyAvailabilitySchema = Type.Object(
  {
    date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    monitoredSeconds: Type.Integer({ minimum: 1, maximum: 86_400 }),
    unavailableSeconds: Type.Integer({ minimum: 0, maximum: 86_400 }),
  },
  { additionalProperties: false },
);

const ServiceSchema = Type.Object(
  {
    id: IdentifierSchema,
    name: Type.String({ minLength: 1 }),
    status: CurrentStatusSchema,
    checks: Type.Array(CheckSchema, { minItems: 1 }),
    dailyAvailability: Type.Array(DailyAvailabilitySchema),
  },
  { additionalProperties: false },
);

const ResponseTimeSampleSchema = Type.Object(
  {
    timestamp: TimestampSchema,
    responseTimeMs: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

const ResponseTimeSeriesSchema = Type.Object(
  {
    serviceId: IdentifierSchema,
    checkId: IdentifierSchema,
    protocol: Type.Union([Type.Literal("ipv4"), Type.Literal("ipv6")]),
    samples: Type.Array(ResponseTimeSampleSchema),
  },
  { additionalProperties: false },
);

const IncidentEventSchema = Type.Object(
  {
    id: IdentifierSchema,
    kind: Type.Literal("incident"),
    state: Type.Union([Type.Literal("open"), Type.Literal("resolved")]),
    title: Type.String({ minLength: 1 }),
    summary: Type.String(),
    affectedServiceIds: Type.Array(IdentifierSchema, { uniqueItems: true }),
    startsAt: TimestampSchema,
    endsAt: Type.Union([TimestampSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

const MaintenanceEventSchema = Type.Object(
  {
    id: IdentifierSchema,
    kind: Type.Literal("maintenance"),
    state: Type.Union([
      Type.Literal("scheduled"),
      Type.Literal("active"),
      Type.Literal("completed"),
    ]),
    title: Type.String({ minLength: 1 }),
    summary: Type.String(),
    affectedServiceIds: Type.Array(IdentifierSchema, { uniqueItems: true }),
    startsAt: TimestampSchema,
    endsAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const StatusDocumentSchema = Type.Object(
  {
    schemaVersion: Type.Literal(CONTRACT_SCHEMA_VERSION),
    generatedAt: TimestampSchema,
    monitoringStartedAt: TimestampSchema,
    services: Type.Array(ServiceSchema),
  },
  schemaOptions("status"),
);

export const ResponseTimesDocumentSchema = Type.Object(
  {
    schemaVersion: Type.Literal(CONTRACT_SCHEMA_VERSION),
    generatedAt: TimestampSchema,
    monitoringStartedAt: TimestampSchema,
    series: Type.Array(ResponseTimeSeriesSchema),
  },
  schemaOptions("response-times"),
);

export const IncidentsDocumentSchema = Type.Object(
  {
    schemaVersion: Type.Literal(CONTRACT_SCHEMA_VERSION),
    generatedAt: TimestampSchema,
    events: Type.Array(
      Type.Union([IncidentEventSchema, MaintenanceEventSchema]),
    ),
  },
  schemaOptions("incidents"),
);

export type StatusDocument = Static<typeof StatusDocumentSchema>;
export type ResponseTimesDocument = Static<typeof ResponseTimesDocumentSchema>;
export type IncidentsDocument = Static<typeof IncidentsDocumentSchema>;
