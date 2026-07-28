<div align="center">

# Velvet

**A polished, dark, open-source front-end for [Upptime](https://upptime.js.org) status pages.**

<img src="docs/screenshot.png" alt="Velvet status page" width="820">

</div>

<br>

Indigo-monochrome, selectable uptime history (24h–1yr), optional per-service IPv4/IPv6 cards, [Phosphor](https://phosphoricons.com) duotone icons, and no server required.

## How it works

Velvet is a static Svelte app. Every presentation surface reads the validated, versioned documents in `velvet-data/v1`: service status, response times, availability history, incidents, and maintenance. The compatibility adapter converts an existing Upptime repository into that Velvet-owned model. Nothing project-specific is baked into the bundle: `config.json` selects the GitHub storage location, brand, theme, and icons.

## Use it with an existing Upptime repo (GitHub Action)

First install the [Velvet data sync workflow](actions/sync-data/README.md). It materializes and validates `velvet-data/v1` whenever monitoring data or incidents change.

Then add a workflow that builds Velvet from those documents and publishes it to GitHub Pages:

```yaml
name: Velvet
on:
  push:
    paths: [".upptimerc.yml", "velvet-data/v1/**", "assets/**", ".github/workflows/velvet.yml"]
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
      - uses: actions/checkout@v7
      - uses: phranck/velvet@v1
        with:
          config: .upptimerc.yml
          data: velvet-data/v1
          output: velvet-dist
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: velvet-dist
      - id: deploy
        uses: actions/deploy-pages@v4
```

Then set **Settings → Pages → Source → "GitHub Actions"** so this deploy bypasses the `gh-pages` branch — Upptime's stock site builders (`site.yml` / `setup.yml`) can no longer overwrite Velvet (disable them if they appear). A new normalized data commit rebuilds the page.

## Use it for a new project (Template)

No Upptime repo yet? Start from [velvet-template](https://github.com/phranck/velvet-template) — "Use this template" gives you Upptime monitoring plus Velvet, pre-wired.

## Configure

Velvet reads standard Upptime fields (`owner`, `repo`, `status-website.name`, `logoUrl`, `navbar`) plus a `velvet` block under `status-website` for the look:

```yaml
status-website:
  name: Example
  velvet:
    layout: cards        # or "grouped"
    theme:
      accent: "#6366f1"
      protocol:
        ipv4: "#7c7ef3"
        ipv6: "#38bdf8"
    icons:
      frontend: ph-globe
```

**Every option — all `sites` check fields, the `status-website` identity, the full `velvet` appearance block (layout, colours, fonts, icons), and which stock Upptime fields Velvet ignores — is documented in the [configuration reference](CONFIGURATION.md).**

### Local theme configurator

The complete configurator is served locally and never uploads an opened configuration:

```bash
./config start    # open http://127.0.0.1:2342
./config stop
./config version
./config help
```

Its distributable HTML, CSS, JavaScript, and font assets live entirely under
[`configurator/`](configurator/). The server binds only to `127.0.0.1`.

## Develop

```bash
npm install
npm run dev --workspace @velvet/site # http://localhost:5173
npm run build                         # contracts and site/dist
```

`site/public/config.json` is a sample config used for local development; the Action regenerates it from each consumer's `.upptimerc.yml`.

The versioned, presentation-independent Velvet data contracts live in [`packages/contracts`](packages/contracts). That package owns the JSON Schemas, matching TypeScript types, runtime validation, and contract fixtures. The site, social card, and SEO generator all consume those contracts directly.

## Licensing and provenance

Monitoring data, imported datasets, and third-party materials keep their own
rights and licenses. See the [licensing and provenance policy](LICENSING.md) and
[third-party notices](THIRD_PARTY_NOTICES.md) for the exact boundaries.

## License

This repository has been published under the [MIT](https://layered.mit-license.org) license.
