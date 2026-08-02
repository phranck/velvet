# Velvet monitor

`@velvet/monitor` executes normalized Velvet HTTP checks and turns their
results into current status, availability history, and response-time data. It
uses Bun and Node-compatible `http` and `https` primitives directly, forces
IPv4 lookup, and has no runtime dependency on GitHub or
the presentation layer.

## Checks and state

```ts
import {
  executeMonitorChecks,
  updateCheckState,
} from "@velvet/monitor";

const observations = await executeMonitorChecks(configuration.services);
const nextCheckState = updateCheckState(
  previousCheckState,
  observations[0],
  configuration.incidents,
);
```

Each configured check gets one initial attempt and at most one immediate
retry. Cancellation and missing or invalid secret configuration are not
retried. Failure and recovery thresholds apply across uptime runs. A pending
failure or recovery is `degraded`; a confirmed failure is `down`. A check that
cannot produce a reliable target result is `unavailable` without changing its
failure or recovery counters.

The current display state and the measured target result remain separate.
This lets a recovered target count as available immediately while the display
still waits for the configured recovery threshold. Multiple check states are
combined with `aggregateServiceStatus`; their measured results are combined
with `aggregateServiceTargetAvailability`.

The executor resolves configured header values by environment-variable name
before latency measurement starts. Secret values are sent only to the original
origin and same-origin redirects. Cross-origin redirects drop all configured
headers. Status-only checks never parse the response body. Explicit JSON
assertions read at most 64 KiB and evaluate safe RFC 6901 pointers.

Observations and optional check log records contain service and check
identifiers, the measured result, response status, attempts, and a stable
failure code. They never contain endpoint URLs, connection details, secret
names, or secret values.

## History and generated data

`appendStateChanges` records only display-state or measured-availability
changes. This history is append-only and is never shortened. Daily availability
is derived from these state intervals:

- `available` counts as monitored time.
- `unavailable` counts as monitored and unavailable time.
- `unobserved` is excluded because no reliable target result exists.
- Planned maintenance does not change measured availability. It remains a
  separate neutral event in the incident history.

`appendResponseSamples` stores response times separately. Successful samples
contain latency; unsuccessful or unobserved samples contain `null`. Only this
sample history follows `history.retentionDays`. A response-only run can call
`createResponseTimesDocument` without updating uptime state.

The private state can also retain completed incident and maintenance events
imported during a one-time migration. Each imported event keeps its source
repository, pinned commit, and GitHub Issue URL. Native Velvet events take
ownership when they use the same event ID. Imported events are removed after
`history.retentionDays`; unresolved legacy incidents are never frozen into
private state.

`createStatusDocument`, `createResponseTimesDocument`, and
`createMonitorDocuments` validate every generated public value against the
Velvet v1 contracts before returning it. Invalid output throws
`MonitorDocumentValidationError` with a stable code.

## Safe private state

`updateMonitorState` updates one versioned private JSON state file while
holding an exclusive local lock. The update callback receives the latest state
only after the lock is acquired. Duplicate run identifiers return the stored
state unchanged. Runs that started before or at the same time as the latest
stored run are rejected as stale.

The complete next state and both public documents are validated before a
temporary file is written. The temporary file is flushed and atomically
replaces the previous state. If validation or writing fails, the previous
complete file remains readable and temporary files are removed. Store failures
use `MonitorStateStoreError` with stable, redacted error codes.

Run uptime checks whenever current status should be refreshed. Run response
sampling on its independently configured schedule. Both modes use unique run
identifiers and the same private state store so an older or concurrent result
cannot replace newer data.
