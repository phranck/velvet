<div align="center">

[![Release](https://img.shields.io/github/v/tag/phranck/velvet?sort=semver&label=release&color=6366f1&labelColor=0e1015)](https://github.com/phranck/velvet/releases)
[![License](https://img.shields.io/github/license/phranck/velvet?color=6366f1&labelColor=0e1015)](https://mit-license.org)
[![Stars](https://img.shields.io/github/stars/phranck/velvet?color=6366f1&labelColor=0e1015)](https://github.com/phranck/velvet/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/phranck/velvet?color=6366f1&labelColor=0e1015)](https://github.com/phranck/velvet/commits)
[![Issues](https://img.shields.io/github/issues/phranck/velvet?color=6366f1&labelColor=0e1015)](https://github.com/phranck/velvet/issues)
[![Svelte](https://img.shields.io/badge/Svelte-5-6366f1?logo=svelte&logoColor=white&labelColor=0e1015)](https://svelte.dev)
[![Vite](https://img.shields.io/badge/Vite-6-6366f1?logo=vite&logoColor=white&labelColor=0e1015)](https://vite.dev)
[![Built for Upptime](https://img.shields.io/badge/built%20for-Upptime-6366f1?labelColor=0e1015)](https://upptime.js.org)

# Velvet

**A polished, dark, open-source front-end for [Upptime](https://upptime.js.org) status pages.**

<img src="docs/screenshot.png" alt="Velvet status page" width="820">

</div>

Indigo-monochrome, selectable uptime history (24h–1yr), Phosphor duotone icons, live data straight from your Upptime repo — no server required.

## How it works

Velvet is a static Svelte app. It fetches your repo's `history/summary.json` and open GitHub issues **at runtime**, so the deployed bundle stays valid while Upptime keeps refreshing the data. Nothing project-specific is baked into the build — a generated `config.json` drives the owner/repo, brand, theme, and icons.

## Use it with an existing Upptime repo (GitHub Action)

Add a workflow that builds Velvet from your `.upptimerc.yml` and publishes it to GitHub Pages:

```yaml
name: Velvet
on:
  push:
    paths: [".upptimerc.yml", "assets/**", ".github/workflows/velvet.yml"]
  issues:
    types: [opened, closed, reopened, edited, labeled, unlabeled]
  repository_dispatch:
    types: [static_site]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: velvet-pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: phranck/velvet@v1
        with:
          config: .upptimerc.yml
          output: velvet-dist
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: velvet-dist
      - id: deploy
        uses: actions/deploy-pages@v4
```

Then set **Settings → Pages → Source → "GitHub Actions"** so this deploy bypasses the `gh-pages` branch — Upptime's stock site builders (`site.yml` / `setup.yml`) can no longer overwrite Velvet (disable them if they appear). The `issues` trigger rebuilds the `/incidents.atom` feed when incidents change.

## Use it for a new project (Template)

No Upptime repo yet? Start from [velvet-template](https://github.com/phranck/velvet-template) — "Use this template" gives you Upptime monitoring plus Velvet, pre-wired.

## Configure

Velvet reads standard Upptime fields (`owner`, `repo`, `status-website.name`, `logoUrl`, `navbar`) plus a `velvet` block under `status-website` for the look:

```yaml
status-website:
  name: Example
  velvet:
    layout: cards        # or "grouped"
    accent: "#6366f1"    # indigo by default
    icons:
      frontend: ph-globe
```

**Every option — all `sites` check fields, the `status-website` identity, the full `velvet` appearance block (layout, colours, fonts, icons), and which stock Upptime fields Velvet ignores — is documented in the [configuration reference](CONFIGURATION.md).**

## Develop

```bash
cd site
npm install
npm run dev   # http://localhost:5173, reads site/public/config.json
npm run build # → site/dist
```

`site/public/config.json` is a sample config used for local development; the Action regenerates it from each consumer's `.upptimerc.yml`.

## License

This repository has been published under the [MIT](https://mit-license.org) license.
