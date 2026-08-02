# Velvet monitor action

This composite action runs Velvet's native IPv4 checks and publishes the
validated private state and public v1 documents to the dedicated
`velvet-data` branch.

## Install

1. Add a validated `velvet.yml` to the repository root. See the
   [native configuration reference](../../documentation/configuration.md#github-native-monitor-configuration).
2. Copy [`examples/velvet-status.yml`](examples/velvet-status.yml) and
   [`examples/velvet-response-times.yml`](examples/velvet-response-times.yml)
   to `.github/workflows/` in the status repository.
3. Replace the documented Velvet action reference with the full 40-character
   commit SHA of the version being installed. Keep the official checkout Action
   pinned as shown.
4. If a check uses a configured header, map only that named repository secret
   into both workflow action steps.
5. Run **Velvet status** manually once. The first successful run creates
   `velvet-data` automatically.

The status workflow runs every five minutes, through manual dispatch, or for a
`repository_dispatch` event of type `velvet-monitor`. It needs:

```yaml
permissions:
  contents: write
  issues: write
```

The response workflow runs at 00:00, 06:00, 12:00, and 18:00 UTC and needs only
`contents: write`. Both workflows share `velvet-status-data` concurrency with
`cancel-in-progress: false`. GitHub lets the running job finish and keeps one
newest pending job.

Do not add pull-request triggers. They are unnecessary and could expose
configured monitor secrets or grant untrusted code write access.

## Run modes

The required `mode` input accepts `status` or `response`:

- `status` updates current availability, consecutive failure or recovery
  counts, daily history, incidents, and maintenance;
- `response` appends response-time samples without changing availability,
  incidents, or maintenance.

Website failures such as DNS, TLS, timeout, assertion, or unexpected status
responses are measurements. Invalid configuration, missing configured secrets,
unsafe request headers, cancellation, invalid stored data, and internal
execution failures stop publication.

Checks without custom headers need no repository secret. For a configured
header, map only its named repository secret into the action step environment:

```yaml
env:
  API_HEALTH_TOKEN: ${{ secrets.API_HEALTH_TOKEN }}
```

Do not pass a catch-all secret object. Velvet does not print endpoint URLs,
secret names, secret values, authorization data, or raw GitHub responses in its
summary.

## Data ownership and retention

The action owns only these paths on `velvet-data`:

- `.velvet/monitor-state.json`
- `velvet-data/v1/status.json`
- `velvet-data/v1/response-times.json`
- `velvet-data/v1/incidents.json`

Each successful new run creates exactly one combined commit with `[skip ci]`.
Rerunning the same GitHub workflow run creates no duplicate commit or Incident.
A concurrent change is loaded once and the same observations are reapplied. A
second conflict stops without overwriting newer data.

`history.retentionDays` accepts `1` through `365`. When the generated Git
history exceeds that period, the current complete snapshot becomes a new root
commit through an exact lease-protected update of `velvet-data`. The action
never rewrites the default branch or deletes historical GitHub Issues.

## Updating the pinned Action

Treat the Velvet commit SHA in each installed workflow as one version pin.
Review Velvet's release notes, replace both workflow references with the same
new full SHA, and run both workflows manually. Never replace the SHA with a
branch name or mutable tag.

## Errors and verification

The Actions summary reports the mode, run outcome, available and unavailable
check counts, incident result, and data-commit result. Failures use a stable
safe code and unique error identifier. The previous valid snapshot remains
available after any failed run.

Run the local focused checks with:

```bash
bun run --filter @velvet/monitor-action test
bun run --filter @velvet/monitor-action typecheck
bun run --filter @velvet/monitor-action build
```

The optional GitHub integration test runs only when its isolated-repository
environment variables are explicitly supplied. It must never target a normal
status repository.
