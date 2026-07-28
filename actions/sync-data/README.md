# Sync Velvet data

This composite action converts an Upptime repository into Velvet's validated v1
documents and commits the complete snapshot to `velvet-data/v1/`.

Copy [`examples/sync-velvet-data.yml`](examples/sync-velvet-data.yml) into the
consumer repository as `.github/workflows/sync-velvet-data.yml`. The reference
workflow reacts to monitoring history, incident events, manual dispatches, and a
scheduled reconciliation run. It intentionally does not deploy GitHub Pages.

The workflow needs only these token permissions:

```yaml
permissions:
  contents: write
  issues: read
```

Its concurrency group matches Upptime's repository mutation lock. Keep that group
unchanged so monitoring updates and Velvet synchronization cannot overlap.

The action writes and validates all three documents before staging them. It uses
the stable `github-actions[bot]` identity and the loop-safe commit message
`chore(velvet): sync data [skip ci]`. An unchanged normalized snapshot does not
create a commit. A non-fast-forward push fails instead of overwriting newer data.

On a fresh Upptime repository with no `history/` directory, the action publishes
a valid initial snapshot: each configured check is `unknown`, and availability
and response-time data are empty. The action never creates or changes Upptime
history. Once Upptime has written its first history files, the next sync replaces
that initial state with the measured snapshot. Missing files inside an existing
history remain an error and leave the last valid Velvet snapshot untouched.

Use a different repository-relative output directory only when necessary. The
directory must still end in the v1 contract segment:

```yaml
- uses: phranck/velvet/actions/sync-data@v1
  with:
    output: public/velvet-data/v1
```

Absolute paths, parent traversal, `.git/`, `.github/`, `.upptimerc.yml`, and
`history/` are rejected.

## Data-license migration

This action writes normalized documents only. It does not copy, replace, or
delete a source data-license notice. Before enabling it, review the consumer
repository's README, `history/LICENSE`, and any dataset-specific attribution.
Preserve applicable notices and publish them next to `velvet-data/v1` when the
source terms require it. In particular, do not remove an existing Upptime ODbL
notice merely because the old history files are later retired. See the
[licensing and provenance policy](../../LICENSING.md) for the migration rules.
