# Sync Velvet data

This composite action is the temporary compatibility boundary between Upptime
monitoring inputs and Velvet's public v1 contract. It converts one pinned source
revision, validates the complete result, and commits the snapshot to
`velvet-data/v1/`.

It publishes:

- `status.json` for services, protocol checks, current status, daily
  availability, and monitoring start;
- `response-times.json` for timestamped IPv4 and IPv6 response series;
- `incidents.json` for sanitized incident and maintenance events.

The Velvet page and browser consume these documents, not `history/summary.json`,
per-check history files, or raw GitHub Issue responses.

Copy [`examples/sync-velvet-data.yml`](examples/sync-velvet-data.yml) into the
consumer repository as `.github/workflows/sync-velvet-data.yml`. The reference
workflow reacts to configuration, monitoring history, Velvet workflow changes,
incident events, manual dispatches, and a scheduled reconciliation run. It
intentionally does not deploy GitHub Pages. Chain the Pages workflow from its
successful completion with `workflow_run`; commits made with `GITHUB_TOKEN` do
not start another push workflow.

The workflow needs only these token permissions:

```yaml
permissions:
  contents: write
  issues: read
```

Its concurrency group matches Upptime's repository mutation lock. Keep that group
unchanged so monitoring updates and Velvet synchronization cannot overlap.

The action reads `.upptimerc.yml`, `history/summary.json`, current per-check
history, paginated history commits, and paginated GitHub Issues from the source
commit checked out by the workflow. It writes all three Velvet documents to a
staging directory and validates them before replacing the previous local
snapshot. It uses the stable `github-actions[bot]` identity and the loop-safe
commit message `chore(velvet): sync data [skip ci]`. An unchanged normalized
snapshot does not create a commit. A non-fast-forward push fails instead of
overwriting newer data.

On a fresh Upptime repository with no `history/` directory, the action publishes
a valid initial snapshot: each configured check is `unknown`, and availability
and response-time data are empty. The action never creates or changes Upptime
history. Once Upptime has written its first history files, the next sync replaces
that initial state with the measured snapshot. Missing files inside an existing
history remain an error and leave the last valid Velvet snapshot untouched.

Other failures also stop before a snapshot commit. These include invalid source
configuration, malformed history, incomplete Upptime data, GitHub request or
rate-limit failures, and contract validation errors. Fix the source or external
failure, then rerun **Sync Velvet data** manually. The scheduled reconciliation
run provides a second recovery path. Never assemble or commit only part of a
Velvet snapshot.

Use a different repository-relative output directory only when necessary. The
directory must still end in the v1 contract segment:

```yaml
- uses: phranck/velvet/actions/sync-data@v1
  with:
    output: public/velvet-data/v1
```

Absolute paths, parent traversal, `.git/`, `.github/`, `.upptimerc.yml`, and
`history/` are rejected.

## Remaining Upptime boundary

This action does not run service checks, schedule monitoring, or write Upptime
history. Keep the Upptime monitoring workflows and source history while using
the compatibility adapter. Set `skipDeleteIssues: true` so closed incidents
remain available for normalization. Velvet can replace this boundary later
without changing browser consumers as long as a future producer emits the same
v1 contract.

## Data-license migration

This action writes normalized documents only. It does not copy, replace, or
delete a source data-license notice. Before enabling it, review the consumer
repository's README, `history/LICENSE`, and any dataset-specific attribution.
Preserve applicable notices and publish them next to `velvet-data/v1` when the
source terms require it. In particular, do not remove an existing Upptime ODbL
notice merely because the old history files are later retired. See the
[licensing and provenance policy](../../LICENSING.md) for the migration rules.
