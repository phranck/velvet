# Velvet contracts

`@velvet/contracts` is the presentation-independent boundary between Velvet data producers and consumers. It has no dependency on Svelte, Upptime, GitHub issue payloads, monitored endpoint URLs, or a specific monitor implementation.

## Version 1 documents

Every document is independently cacheable and carries `schemaVersion` and `generatedAt`:

- `velvet-data/v1/status.json` contains services, aggregate state, explicit IPv4/IPv6 checks, current response times, the monitoring start, and daily availability.
- `velvet-data/v1/response-times.json` contains timestamped series per service and check. A `null` `responseTimeMs` is an unavailable sample, not a zero-millisecond response.
- `velvet-data/v1/incidents.json` contains Velvet incident and maintenance events instead of raw GitHub issue objects.

Daily availability contains only monitored dates. `monitoredSeconds` makes partial days explicit, cannot exceed the actual monitoring window for that UTC day, and an empty array represents no history. Producers must not add synthetic pre-monitoring days.

Maintenance state is relative to `generatedAt`: `scheduled` starts later, `active` contains the generation timestamp, and `completed` has already ended.

The contract describes data shape, not data ownership. Using the schemas does
not apply Velvet's MIT license to monitoring records or replace a source
dataset's copyright, database-right, attribution, or privacy obligations. See
the repository [licensing and provenance policy](../../LICENSING.md).

## Source of truth

[`src/schemas.ts`](src/schemas.ts) is the single editable schema source. The exported `StatusDocument`, `ResponseTimesDocument`, and `IncidentsDocument` TypeScript types are derived from those schemas.

The standalone files under `schemas/velvet-data/v1` are generated from the same source:

```bash
npm run schemas --workspace @velvet/contracts
```

Do not edit generated schema files directly. The schema parity test fails if they differ from the TypeScript source.

## Runtime validation

```ts
import { validateStatusDocument } from "@velvet/contracts";

const result = validateStatusDocument(value);
if (!result.success) {
  console.error(result.errors);
}
```

Validation results use JSON Pointer paths and stable error codes:

- `DUPLICATE_CHECK_ID`
- `DUPLICATE_EVENT_ID`
- `DUPLICATE_RESPONSE_SERIES`
- `DUPLICATE_SAMPLE_TIMESTAMP`
- `DUPLICATE_SERVICE_ID`
- `INVALID_DURATION_RANGE`
- `INVALID_DOCUMENT`
- `INVALID_EVENT_STATE`
- `INVALID_PROTOCOL`
- `INVALID_TIMESTAMP`
- `NEGATIVE_DURATION`
- `TIMESTAMP_OUT_OF_RANGE`
- `UNSUPPORTED_SCHEMA_VERSION`

Codes and paths are suitable for programmatic handling. Messages are human-readable context and may be clarified without a schema-version change.

## Fixtures and verification

Valid and invalid examples live under `fixtures`. They cover dual-stack and IPv4-only services, partial and empty history, unavailable response samples, incidents, maintenance, and every required invariant.

```bash
npm test --workspace @velvet/contracts
npm run typecheck --workspace @velvet/contracts
npm run build --workspace @velvet/contracts
```
