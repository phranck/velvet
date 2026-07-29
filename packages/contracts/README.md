# Velvet contracts

`@velvet/contracts` is the presentation-independent boundary between Velvet data producers and consumers. It has no dependency on Svelte, Upptime, GitHub issue payloads, monitored endpoint URLs, or a specific monitor implementation.

## Velvet configuration

`velvet.yml` is the canonical private repository configuration for the Velvet
monitor, browser onboarding, setup service, template, and build scripts. Its
schema is versioned independently from the public data documents.

The minimal service form needs only a display name and URL:

```yaml
schemaVersion: 1
repository:
  owner: example
  name: status
statusPage:
  name: Example Status
services:
  - name: Website
    url: https://example.com
```

`parseVelvetConfiguration` turns this into a normalized direct HTTP check. The
default check uses IPv4, sends `GET`, follows at most five redirects, requires
the final response to be exactly `200`, measures latency, and ignores the
response body. A successful HTTP response therefore confirms endpoint
availability, not application health represented inside HTML or JSON.

JSON validation is an explicit advanced option for a health endpoint:

```yaml
services:
  - name: API
    checks:
      - name: Application health
        url: https://api.example.com/health
        expectedStatusCodes: [200]
        jsonAssertions:
          - path: /status
            equals: ok
```

Assertions use safe RFC 6901 JSON Pointers and scalar expected values. Advanced
checks may also use `HEAD`, select final status codes, lower the redirect bound,
and reference request-header values by environment-variable name:

```yaml
headers:
  - name: Authorization
    secret: API_HEALTH_TOKEN
```

Do not put a secret value, `$VARIABLE`, or `${VARIABLE}` expression in
`velvet.yml`. Consumers resolve the named environment secret only while issuing
the request and must redact it from output and logs.

The normalized configuration keeps endpoint URLs inside the monitor boundary.
The public `velvet-data/v1` documents deliberately contain no endpoint URL,
request header, or secret reference.

```ts
import { parseVelvetConfiguration } from "@velvet/contracts";

const result = parseVelvetConfiguration(source);
if (!result.success) {
  console.error(result.errors);
}
```

Valid examples cover a minimal website, multiple services, advanced status
codes, JSON health assertions, incident policy, maintenance labeling, and the
current lmaa.space services under
[`fixtures/valid/configuration`](fixtures/valid/configuration). Invalid examples
under [`fixtures/invalid/configuration`](fixtures/invalid/configuration) pin the
stable error code and JSON Pointer for every rejected class.

## Package boundaries

Each runtime layer consumes the narrowest stable output below. Dependencies
flow from product-specific layers toward contracts, never from contracts toward
GitHub, the monitor, setup infrastructure, or Svelte.

| Boundary | Input | Output | Allowed dependencies |
| --- | --- | --- | --- |
| Contracts and configuration | `velvet.yml` text, unknown configuration values, and public document values | Normalized private monitor configuration, public data types, JSON Schemas, and stable validation errors | TypeBox and the YAML parser only |
| Direct HTTP execution | One normalized HTTP check plus an injected secret resolver and clock | Redacted observation containing availability, final status, latency, and assertion outcome | Contracts and runtime HTTP primitives; no GitHub or presentation imports |
| Monitor orchestration and state | Normalized services, observations, previous state, incident policy, and history policy | State transitions and new append-only measurements | Contracts and direct HTTP execution; no Svelte imports |
| GitHub persistence and incidents | State transitions, measurements, and sanitized incident commands | Repository commits and GitHub Issue operations | Contracts, monitor orchestration, and an injected GitHub client |
| Upptime migration | Legacy configuration, history, and incident records | Validated Velvet configuration, public documents, and a provenance report | Contracts plus migration-only legacy parsers; never imported by the monitor runtime |
| Browser onboarding and setup API | User choices and short-lived GitHub App authorization | Validated `velvet.yml` and generated repository changes | Contracts and an injected GitHub App client; generated repositories have no setup-service runtime dependency |
| Svelte presentation | Validated public documents and presentation settings derived from normalized configuration | Static status UI, social image, and SEO files | Contracts and presentation libraries; no monitor, persistence, migration, or endpoint access |

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

[`src/schemas.ts`](src/schemas.ts) is the single editable public-data schema
source. [`src/configuration/schemas.ts`](src/configuration/schemas.ts) owns the
private `velvet.yml` schema. Exported TypeScript input types are derived from
these TypeBox schemas, and the validated configuration API returns the explicit
`NormalizedVelvetConfiguration` type.

The standalone files under `schemas/velvet-data/v1` and
`schemas/velvet-config/v1` are generated from the same sources:

```bash
bun run --filter @velvet/contracts schemas
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

Configuration validation has its own stable codes:

- `DUPLICATE_CONFIGURATION_CHECK_ID`
- `DUPLICATE_CONFIGURATION_SERVICE_ID`
- `DUPLICATE_HEADER_NAME`
- `DUPLICATE_JSON_ASSERTION`
- `FORBIDDEN_SECRET_INTERPOLATION`
- `INCOMPATIBLE_CHECK_OPTIONS`
- `INVALID_CONFIGURATION`
- `INVALID_CONFIGURATION_IDENTIFIER`
- `INVALID_CONFIGURATION_URL`
- `INVALID_SECRET_REFERENCE`
- `INVALID_SERVICE_CHECKS`
- `UNSAFE_JSON_ASSERTION`
- `UNSUPPORTED_CONFIGURATION_METHOD`
- `UNSUPPORTED_CONFIGURATION_STATUS_CODE`
- `UNSUPPORTED_CONFIGURATION_VERSION`

Codes and paths are suitable for programmatic handling. Messages are human-readable context and may be clarified without a schema-version change.

## Fixtures and verification

Valid and invalid examples live under `fixtures`. Public-document examples cover
dual-stack legacy data, IPv4-only services, partial and empty history,
unavailable response samples, incidents, maintenance, and every required
invariant. Configuration examples are IPv4-only and contain no provider-specific
fields.

```bash
bun run --filter @velvet/contracts test
bun run --filter @velvet/contracts typecheck
bun run --filter @velvet/contracts build
```
