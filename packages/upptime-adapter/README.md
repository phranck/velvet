# Velvet Upptime adapter

`@velvet/upptime-adapter` is the temporary compatibility boundary between an
Upptime repository and the Velvet v1 data contract. No Upptime configuration,
endpoint URL, summary field, commit payload, or GitHub issue object is exposed
in the generated Velvet documents.

## Usage

```ts
import {
  convertUpptimeSnapshot,
  loadUpptimeSnapshot,
  serializeVelvetDocuments,
} from "@velvet/upptime-adapter";

const snapshot = await loadUpptimeSnapshot({
  owner: "example",
  repo: "status",
});
const documents = convertUpptimeSnapshot(snapshot, {
  generatedAt: new Date().toISOString(),
});
const files = serializeVelvetDocuments(documents);
```

Pass a commit SHA as `ref` when a workflow must pin every file and commit query
to the same repository state. `token` is optional for private repositories or
higher GitHub API limits.

The source loader reads `.upptimerc.yml`, `history/summary.json`, each current
history file, paginated history commits, and paginated GitHub Issues. A sibling
with the `<slug>-ipv6` convention is folded into the base service. Unmatched
IPv4 or IPv6 checks remain independent services instead of being discarded.

`monitoringStartedAt` is the earliest timestamp found in the current history
files or parsed response-time commits. Down response checks become unavailable
samples with a `null` response time. Non-Upptime commits are ignored, while a
commit marked as Upptime data must match the documented response-time shape.

The converter validates all three documents with `@velvet/contracts` before
returning them. Serialization repeats validation and produces newline-terminated
`status.json`, `response-times.json`, and `incidents.json` strings.

## Stable errors

Failures are reported as `UpptimeAdapterError` with one of these codes:

- `CONTRACT_VALIDATION_FAILED`
- `GITHUB_RATE_LIMITED`
- `GITHUB_REQUEST_FAILED`
- `INVALID_INPUT`
- `MALFORMED_HISTORY_COMMIT`
- `MISSING_HISTORY`
- `PARTIAL_UPSTREAM_DATA`

## Provenance

The adapter is original Velvet code. It interprets the public input behavior
described by the Upptime documentation for
[configuration](https://upptime.js.org/docs/configuration),
[response history](https://upptime.js.org/docs/), and
[scheduled maintenance](https://upptime.js.org/docs/scheduled-maintenance/).
It does not copy or execute Upptime implementation code.

## Migrating licensed data

The adapter converts records but does not transfer or remove source license
files. Before publishing normalized documents, inspect the consumer repository's
own README, `history/LICENSE`, and adjacent notices. Keep those notices with the
source history and add an applicable notice next to `velvet-data/v1` when the
source terms require it.

The upstream Upptime template currently labels its `history` dataset as
[ODbL-1.0](https://github.com/upptime/upptime/blob/89365e67b44f101e9f1875aeb27bb0e2893e4ad5/history/LICENSE).
A consumer repository may use different or additional terms, so its own notices
are authoritative. Do not delete an existing data-license notice when removing
old Upptime files. Velvet's MIT license covers the adapter implementation, not
the imported data or any database rights in it. The complete policy is in
[LICENSING.md](../../LICENSING.md).
