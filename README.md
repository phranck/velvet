<div align="center">

# Velvet

**A static, themeable status page built from a validated, versioned data contract.**

<img src="docs/screenshot.png" alt="Velvet status page" width="820">

</div>

<br>

Velvet provides selectable uptime history, native response-time charts,
first-class IPv4 and IPv6 status, configurable themes, and GitHub Pages
deployment without a server or database.

## How it works

Velvet v1 separates temporary monitoring inputs from the public status page:

1. Upptime currently monitors services and writes `.upptimerc.yml`, `history/`,
   and incident or maintenance Issues.
2. [`phranck/velvet/actions/sync-data@v1`](actions/sync-data) reads one pinned
   repository revision, converts those inputs, validates the result, and commits
   one complete `velvet-data/v1` snapshot.
3. [`phranck/velvet@v1`](action.yml) builds the page, social card, and SEO files
   exclusively from that committed Velvet snapshot.
4. The browser loads and validates `status.json`, `response-times.json`, and
   `incidents.json`. It never reads Upptime history or raw GitHub Issues.

The monitor is not independent from Upptime yet. Upptime remains the temporary
source for checks and history; the compatibility adapter is the controlled
boundary between those inputs and Velvet's public contract.

## Deploy from an existing Upptime repository

### 1. Publish the Velvet snapshot

Copy [`actions/sync-data/examples/sync-velvet-data.yml`](actions/sync-data/examples/sync-velvet-data.yml)
to `.github/workflows/sync-velvet-data.yml` in the status repository. The
workflow reacts to monitoring history, incident and maintenance Issues, manual
runs, and scheduled reconciliation. It needs `contents: write` and
`issues: read`.

Set `skipDeleteIssues: true` in `.upptimerc.yml` so short resolved incidents
remain available for normalization.

### 2. Build and deploy after synchronization

Add `.github/workflows/velvet.yml`:

```yaml
name: Velvet

on:
  workflow_run:
    workflows: ["Sync Velvet data"]
    types: [completed]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: velvet-pages
  cancel-in-progress: false

jobs:
  build:
    if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
    name: Build and deploy
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.repository.default_branch }}
      - name: Build Velvet site
        uses: phranck/velvet@v1
        with:
          config: .upptimerc.yml
          data: velvet-data/v1
          output: velvet-dist
      - name: Configure Pages
        uses: actions/configure-pages@v6
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v5
        with:
          path: velvet-dist
      - name: Deploy to GitHub Pages
        id: deploy
        uses: actions/deploy-pages@v5
```

The Pages workflow uses `workflow_run` deliberately. Commits created with the
workflow `GITHUB_TOKEN` do not start a second push workflow, so a push-only Pages
workflow can miss a newly synchronized snapshot.

Finally, set **Settings > Pages > Source** to **GitHub Actions**. Disable
Upptime's stock `site.yml` or `setup.yml` page workflows if they appear, so only
Velvet publishes the status page.

The complete trigger, failure, recovery, and migration behavior is documented
in the [configuration reference](CONFIGURATION.md#compatibility-pipeline-and-velvet-v1-data).

## Start a new status repository

Use [velvet-template](https://github.com/phranck/velvet-template). It includes
the temporary Upptime monitor, normalized Velvet snapshot workflow, Pages
deployment, issue templates, and a configuration walkthrough.

## Velvet v1 data

The presentation-independent contract lives in
[`packages/contracts`](packages/contracts):

- `status.json` contains services, protocol checks, current state, response
  times, monitoring start, and daily availability.
- `response-times.json` contains timestamped response series. `null` means an
  unavailable sample, not a zero-millisecond response.
- `incidents.json` contains sanitized incident and maintenance events instead of
  raw GitHub Issue payloads.

Every document carries `schemaVersion` and `generatedAt`, is independently
cacheable, and is validated before publication and again in the browser.

## Configure

Page identity remains in standard `status-website` fields. Velvet appearance
and data-location settings live under `status-website.velvet`:

```yaml
owner: example
repo: status
skipDeleteIssues: true

status-website:
  name: Example Status
  velvet:
    layout: cards
    theme:
      name: Example Theme
      palette:
        canvas: "#0a0b0f"
        foreground: "#e8eaed"
        accent: "#6366f1"
        alternate: "#38bdf8"
        warning: "#d29922"
        danger: "#f85149"
        textPrimary: "#e8eaed"
        textSecondary: "#8b8c90"
        textTertiary: "#515256"
      protocol:
        ipv4: accent
        ipv6: alternate
    icons:
      website: ph-globe
```

See [CONFIGURATION.md](CONFIGURATION.md) for every monitoring, deployment,
theme, chart, layout, analytics, SEO, and migration option.

### Local theme configurator

The configurator opens and saves YAML locally. Opened files are never uploaded:

```bash
./config start
./config stop
./config version
./config help
```

It is available at `http://127.0.0.1:2342` while running. The distributable
HTML, CSS, JavaScript, and font assets live under [`configurator/`](configurator/).

## Develop

Velvet pins Bun 1.3.14 as its package manager and JavaScript runtime.

| Environment | Supported path |
| --- | --- |
| Local macOS | Bun 1.3.14 on Apple Silicon or Intel |
| Linux CI | `oven-sh/setup-bun@v2` reading the root `packageManager` pin |
| Playwright | Chromium installed through `bunx --bun playwright` |
| Composite Actions | `oven-sh/setup-bun@v2` with Bun 1.3.14 pinned explicitly |

```bash
bun install --frozen-lockfile
bun run build
bun run test
bun run typecheck
```

The site, social card, SEO generator, compatibility adapter, and sync Action all
consume the same generated contract types and validators.

## Releases

See [CHANGELOG.md](CHANGELOG.md) for user-facing release notes and
[RELEASING.md](RELEASING.md) for the release checklist.

## Licensing and provenance

Monitoring data, imported datasets, and third-party materials retain their own
rights and licenses. See [LICENSING.md](LICENSING.md) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the exact boundaries.

## License

This repository has been published under the [MIT](https://layered.mit-license.org) license.
