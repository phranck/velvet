# Velvet configuration reference

Velvet keeps page identity and appearance in **`.upptimerc.yml`** while the
temporary compatibility monitor remains Upptime. Runtime presentation data
comes exclusively from the validated documents under `velvet-data/v1`.

This page documents every field Velvet reads, the compatibility pipeline, and
the Upptime fields needed to monitor services. Upptime has additional options
for notifications, schedules, assignees, localization, and commit messages.
Those continue to affect monitoring but do not change Velvet's appearance. See
the [Upptime configuration docs](https://upptime.js.org/docs/configuration) for
that wider monitor configuration.

> **Velvet vs. the stock Upptime page.** Velvet replaces Upptime's built-in
> Svelte/Sapper page. That means the stock `status-website` appearance fields
> (`theme`, `themeUrl`, `introTitle`, `introMessage`, `customHeadHtml`,
> `customBodyHtml`, `customFootHtml`, `favicon`, `faviconSvg`, `scripts`, `js`,
> `links`, `css`, `metaTags`) have **no effect** with Velvet. See
> [Fields Velvet ignores](#fields-velvet-ignores). Use the
> [`velvet:` block](#status-websitevelvet-velvet-appearance) instead.

---

## Minimal config

The smallest file that produces a working page:

```yaml
owner: your-username
repo: your-status-repo
skipDeleteIssues: true

sites:
  - name: Website
    url: https://example.com

status-website:
  name: Example
```

---

## Top-level fields

| Field | Required | Description |
| --- | --- | --- |
| `owner` | **yes** | GitHub user or org that owns the repository containing `velvet-data/v1`. |
| `repo` | **yes** | Repository containing the versioned Velvet data documents. |
| `skipDeleteIssues` | recommended | Keep short resolved Upptime incidents as closed Issues so the compatibility adapter can normalize their history. Set this to `true`. |

`owner` and `repo` are required. Velvet's config generator throws without them.

---

## Compatibility pipeline and Velvet v1 data

Velvet owns the public data boundary even though Upptime still supplies the
temporary monitoring inputs.

| Stage | Responsibility |
| --- | --- |
| Upptime | Reads `sites`, performs checks, writes `history/summary.json` and per-check history, and opens or closes incident Issues. |
| Velvet sync Action | Pins the current repository commit, reads Upptime configuration and history plus GitHub Issues, converts and validates all three Velvet documents, and commits one complete snapshot. |
| Velvet build Action | Builds the status page, social card, and SEO output from `.upptimerc.yml` plus the committed Velvet snapshot. |
| Browser | Loads `config.json` and the three validated Velvet documents. It does not read Upptime history or raw GitHub Issue payloads. |

The remaining Upptime boundary is explicit: Velvet does not yet schedule or run
service checks, write monitoring history, or own the complete monitor
configuration. Do not remove Upptime workflows or `history/` while using the v1
compatibility adapter.

### The three documents

All files live in `velvet-data/v1` by default and carry `schemaVersion: 1` plus
an ISO `generatedAt` timestamp.

| Document | Contents |
| --- | --- |
| `status.json` | Services, aggregate state, explicit IPv4 and IPv6 checks, current response times, monitoring start, and daily monitored and unavailable seconds. |
| `response-times.json` | Timestamped series for every service and check. A `null` response time means the check was unavailable. |
| `incidents.json` | Sanitized incident and maintenance events with stable IDs, states, affected service IDs, and start or end times. No endpoint URL or raw Issue payload is exposed. |

The schemas, TypeScript types, validators, invariants, and valid and invalid
examples are published under [`packages/contracts`](packages/contracts).

### Update triggers

The reference sync workflow runs when:

- `.upptimerc.yml` or `history/**` changes on the default branch;
- either Velvet workflow file changes on the default branch;
- an Issue is opened, closed, reopened, edited, labeled, or unlabeled;
- a user starts `workflow_dispatch`;
- the six-hour reconciliation schedule runs.

Its concurrency group matches Upptime's repository mutation lock. The Action
reads one source commit, writes all documents into a staging directory, validates
the complete set, swaps the snapshot into place, and commits only when normalized
output changed. A non-fast-forward push fails instead of replacing newer data.

The Pages workflow must run after the **Sync Velvet data** workflow succeeds.
Use `workflow_run`, as shown in the [README](README.md#2-build-and-deploy-after-synchronization).
A snapshot commit made with `GITHUB_TOKEN` does not trigger a second push
workflow.

### Browser caching and refresh

The browser requests the three documents in parallel with cache revalidation and
validates every response before rendering. Initial rendering is all-or-nothing:
an unavailable, malformed, or unsupported document produces a safe status-data
error instead of mixing snapshots.

Incident and maintenance data refreshes every 60 seconds while the tab is
visible and immediately when the tab becomes visible again. A failed or invalid
refresh keeps the latest valid incident document. A slower response cannot
replace a newer document because `generatedAt` determines freshness.

### Errors and recovery

The compatibility adapter distinguishes invalid input, missing or partial
history, malformed history commits, GitHub request or rate-limit failures, and
contract validation failures. Any such failure stops before the Action stages a
commit, leaving the last valid `velvet-data/v1` snapshot intact.

A repository with no `history/` directory is a supported fresh-install state.
Velvet publishes configured checks as `unknown` with empty availability and
response series. Missing or malformed files inside an existing `history/`
directory are treated as partial upstream data and do not replace the previous
snapshot.

After fixing the source data or GitHub availability, rerun **Sync Velvet data**
manually. The scheduled reconciliation is a second recovery path. Do not delete
the previous snapshot or manually assemble a partial replacement.

### Migrating an existing status repository

1. Set `skipDeleteIssues: true` and preserve any source data-license notices.
2. Install the reference sync workflow and run it once.
3. Verify that all three `velvet-data/v1` documents were committed and validate
   against the v1 schemas.
4. Change the Pages workflow to build with `phranck/velvet@v1` and
   `data: velvet-data/v1` after successful synchronization.
5. Set Pages to **GitHub Actions** and disable stock Upptime site builders.
6. Keep Upptime monitoring and history workflows until Velvet ships an
   independent monitor.

The data-source change is breaking for older Velvet deployments that read
Upptime runtime files or GitHub APIs directly. The compatibility pipeline is the
migration path; do not point the v1 page at `history/summary.json`.

---

## `sites`: what to monitor

A list of endpoints. Each one becomes a row/card on the page. `name` and `url`
are all you need; everything else is optional.

| Field | Description | Example |
| --- | --- | --- |
| `name` | **Required.** Display name. Also the source of the service **slug** (see below), which links a service to its icon. | `Backend` |
| `url` | **Required.** URL (or IP) to check. | `https://api.example.com/health` |
| `method` | HTTP verb. Default `GET`. | `POST` |
| `check` | Check type: omit for HTTP, or `tcp-ping` / `icmp-ping`. | `tcp-ping` |
| `port` | Port for `tcp-ping`. | `443` |
| `ipv6` | Force IPv6-only DNS resolution for this check. | `true` |
| `headers` | Request headers, as `Key: Value` strings. Supports `$SECRET` env interpolation. | `["Authorization: Bearer $TOKEN"]` |
| `body` | Request body (for `POST`/`PUT`). | `'{"ping":true}'` |
| `expectedStatusCodes` | HTTP codes that count as **up**. Default: `200`–`299`. | `[200, 201, 401]` |
| `maxResponseTime` | Milliseconds above which a response is **degraded** (amber). | `5000` |
| `slug` | Override the auto-generated slug (see below). | `api-eu` |
| `assignees` | GitHub usernames auto-assigned to this service's incident issues. | `["octocat"]` |
| `icon` | Upptime's own favicon field. **Ignored by Velvet** because Velvet uses Phosphor icons via [`velvet.icons`](#icons). | n/a |
| `__dangerous__disable_verify_peer` | Skip SSL certificate verification. | `true` |
| `__dangerous__disable_verify_host` | Skip certificate hostname matching. | `true` |
| `__dangerous__body_down` | Mark **down** if the response body contains this text. | `"File not found"` |
| `__dangerous__body_degraded` | Mark **degraded** if the body contains this text. | `"maintenance"` |
| `__dangerous__body_down_if_text_missing` | Mark **down** if this text is **absent**. | `'"status":"ok"'` |
| `__dangerous__body_degraded_if_text_missing` | Mark **degraded** if this text is absent. | `'"status":"ok"'` |

### How the slug works

Velvet maps each service to its [icon](#icons) by **slug**. Upptime derives the
slug from the `name`: lowercased, spaces and punctuation become hyphens. So:

| `name` | slug |
| --- | --- |
| `Frontend` | `frontend` |
| `Developer Site` | `developer-site` |
| `API (EU)` | `api-eu` |

Set `slug:` on the site to pin it explicitly. The slug is the key you use under
[`velvet.icons`](#icons).

---

## `status-website`: page identity

| Field | Description | Example |
| --- | --- | --- |
| `name` | Brand name shown next to the logo and used for the browser tab title. Defaults to `repo`. | `Example` |
| `logoUrl` | URL of a logo image shown top-left. If set, the **logo is shown instead of the name text**, and it links to `/`. | `https://example.com/logo.svg` |
| `cname` | Custom domain. Velvet writes a `CNAME` file into the build so the domain survives each deploy. | `status.example.com` |
| `navbar` | Additional links shown beside the brand. Each is `{ title, href }`. `$OWNER`/`$REPO` are substituted. A root `/` entry is suppressed because the brand already links there. Use `navbar: []` for none. | see below |

```yaml
status-website:
  name: Example
  logoUrl: https://example.com/logo.svg
  cname: status.example.com
  navbar:
    - title: History
      href: https://github.com/$OWNER/$REPO/issues
    - title: GitHub
      href: https://github.com/$OWNER/$REPO
```

### Fields Velvet ignores

These stock Upptime appearance fields do **nothing** with Velvet, because Velvet
renders its own front-end: `theme`, `themeUrl`, `favicon`, `faviconSvg`,
`introTitle`, `introMessage`, `customHeadHtml`, `customBodyHtml`,
`customFootHtml`, `scripts`, `js`, `links`, `css`, `metaTags`. Configure
Velvet's look through the [`velvet:` block](#status-websitevelvet-velvet-appearance)
instead. (`baseUrl`, `robotsText`, `publish`, `apiBaseUrl`, `userContentBaseUrl`
are infrastructure fields Upptime still honours.)

---

## `status-website.velvet`: Velvet appearance

All Velvet-specific options live here, so the file stays a valid Upptime config.

```yaml
status-website:
  velvet:
    layout: cards
    # logoHeight: 72
    # defaultRange: 30d
    # showPoweredBy: true
    # dataBranch: main
    # dataBaseUrl: https://cdn.example/status/velvet-data/v1
    # fontSans: "Inter"
    # fontMono: "JetBrains Mono"
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
      grid:
        operational: accent
        degraded: warning
        outage: danger
        noData: auto
      protocol:
        ipv4: accent
        ipv6: alternate
      chart:
        ipv4LineStyle: solid
        ipv6LineStyle: dashed
        fill: true
        background: canvas
        backgroundOpacity: 0.2
      background:
        start: auto
        end: canvas
        blobs:
          enabled: true
          count: 3
          colors:
            - accent
            - alternate
      card:
        background: auto
        border: auto
        separator: auto
        borderEnabled: true
        shadowEnabled: true
        radius: 14
        padding: 16
        maxWidth: 760
      headline:
        start: textPrimary
        end: textSecondary
      service:
        icon: accent
      text:
        primary: textPrimary
        secondary: textSecondary
        tertiary: textTertiary
    # Analytics is optional. A tracker is injected only when configured.
    # umami:
    #   websiteId: "xxxxxxxx-xxxx-xxxx-xxxx"
    #   src: "https://analytics.example.com/script.js"
    # googleAnalytics: "G-XXXXXXXXXX"
    # SEO overrides are optional. Every field is auto-derived by default.
    # seo:
    #   title: "Acme System Status"
    #   description: "Real-time uptime for Acme."
    #   image: "https://acme.example/og.png"
    icons:
      frontend: ph-globe
      backend: ph-gear-six
```

| Field | Default | Description |
| --- | --- | --- |
| `layout` | `grouped` | `grouped` puts all services in one card; `cards` gives each service its own card. Any value other than `cards` is treated as `grouped`. |
| `logoHeight` | `72` | Logo height in pixels. Width scales proportionally. |
| `defaultRange` | `30d` | History window pre-selected on a visitor's first visit. Accepts a label (`24h`, `7d`, `30d`, `90d`, `1yr`) or the internal key (`day`, `week`, `month`, `quarter`, `year`). Once a visitor picks a range it is remembered and wins over this default. |
| `showPoweredBy` | `true` | Show the centered "Powered by Velvet" credit after the service cards. |
| `theme` | _(built-in)_ | Semantic colour configuration shared by the live page and generated social card. See [Theme](#theme). |
| `fontSans` | `Inter` | Overrides the UI font (CSS `--font-sans`). See the note below. |
| `fontMono` | `JetBrains Mono` | Overrides the monospace font (CSS `--font-mono`). |
| `dataBranch` | `main` | Branch containing `velvet-data/v1`. |
| `dataBaseUrl` | _(derived)_ | Optional public HTTP(S) base URL for the three Velvet v1 documents. It must serve the same snapshot supplied to the Action's `data` input; otherwise Velvet derives the raw GitHub URL from `owner`, `repo`, `dataBranch`, and that repository-relative input path. |
| `umami` | _(off)_ | [Umami](https://umami.is) analytics. An object with `websiteId` (the site's `data-website-id`) and `src` (full tracking-script URL, e.g. `https://analytics.example.com/script.js`). **Both** are required; the tracker loads only when both are set. |
| `googleAnalytics` | _(off)_ | Google Analytics 4 measurement ID (e.g. `G-XXXXXXXXXX`). The tracker loads when set. |
| `seo` | _(auto)_ | Overrides for the auto-generated SEO (see [SEO & crawlers](#seo--crawlers)). An object with optional `title`, `description`, and `image` (og:image). Each defaults to an auto-derived value, so set only the ones you want to change. |
| `icons` | _(built-ins)_ | Per-slug Phosphor icon overrides. See [Icons](#icons). |

### Theme

All theme values live under `status-website.velvet.theme`. The nine palette
entries are six-digit hexadecimal colors. Every detailed color role accepts
`auto`, one of the palette keys, or its own six-digit hexadecimal override.
Palette references remain linked: changing a named color updates every role
that references it. `auto` uses Velvet's semantic default for that role.

| Field | Description |
| --- | --- |
| `name` | Theme name used by the local configurator and exported YAML. It is independent from `status-website.name`. |
| `palette.canvas` | Base page and chart-canvas color. |
| `palette.foreground` | High-contrast surface and default foreground color. |
| `palette.accent` | Primary interactive and operational color. |
| `palette.alternate` | Secondary accent and default IPv6 color. |
| `palette.warning` | Default degraded-state color. |
| `palette.danger` | Default outage color. |
| `palette.textPrimary` | Default primary text color. |
| `palette.textSecondary` | Default supporting text color. |
| `palette.textTertiary` | Default low-emphasis text color. |
| `grid.operational` | Uptime segments and status indicators for healthy checks. Defaults to `accent`. |
| `grid.degraded` | Uptime segments and status indicators for degraded checks. Defaults to `warning`. |
| `grid.outage` | Uptime segments and status indicators for outages. Defaults to `danger`. |
| `grid.noData` | Uptime segments and status indicators without data. |
| `protocol.ipv4` | IPv4 labels, legend, and response-time curve. Defaults to `accent`. |
| `protocol.ipv6` | IPv6 labels, legend, and response-time curve. Defaults to `alternate`. |
| `chart.ipv4LineStyle` | IPv4 curve style: `solid`, `dashed`, or `dotted`. |
| `chart.ipv6LineStyle` | IPv6 curve style: `solid`, `dashed`, or `dotted`. |
| `chart.fill` | Fade each protocol color below its response-time line. |
| `chart.background` | Canvas color mixed across the complete service card. |
| `chart.backgroundOpacity` | Canvas mix from `0` to `1`. |
| `background.start` | Top colour of the vertical page gradient. |
| `background.end` | Bottom colour of the vertical page gradient. |
| `background.blobs.enabled` | Enables or disables the cloudy background blobs. |
| `background.blobs.count` | Number of blobs, clamped to `1`–`5`. Their stable positions are distributed from the repository identity. |
| `background.blobs.colors` | Exactly two colours, alternated across the blobs. |
| `card.background` | Card background colour. |
| `card.border` | Card border colour. |
| `card.separator` | Separator-line colour inside and between cards. |
| `card.borderEnabled` | Enables or disables card outlines without removing separators. |
| `card.shadowEnabled` | Enables or disables the shared card shadow. |
| `card.radius` | Corner radius in pixels, clamped to `0`–`32`. |
| `card.padding` | Equal card padding in pixels, clamped to `0`–`32`. |
| `card.maxWidth` | Service-card width: `640`, `760`, `920`, or `1080` pixels. Other numbers resolve to the nearest stage. |
| `headline.start` | First status-headline gradient stop. |
| `headline.end` | Second status-headline gradient stop. |
| `service.icon` | Shared color for service icons and disclosure controls. |
| `text.primary` | Main headings, service names, and primary values. |
| `text.secondary` | Supporting labels and secondary values. |
| `text.tertiary` | Range labels, footer text, and low-emphasis copy. |

Response-time curves use monotone cubic interpolation. This smooths the graph
without inventing values beyond local extrema; unavailable samples still split
the curve into visible gaps.

The former fields `status-website.velvet.accent`, `accentDeg`, and `accentDown`,
plus `theme.accent`, remain supported for existing configurations. New
configurations should use `theme.palette.accent`, `theme.grid.degraded`, and
`theme.grid.outage`.

> **Font note.** `fontSans`/`fontMono` only change the CSS font-family. Velvet
> loads **Inter** and **JetBrains Mono** itself; to use a different family,
> ensure it's available to the browser (e.g. a system font, or add an
> `@import`/`<link>`. Custom `<head>` HTML is not configurable via
> `.upptimerc.yml` with Velvet).

> **Analytics note.** `umami` and `googleAnalytics` are independent. Enable
> either, both, or neither. Velvet injects the configured tracker(s) into the
> page at runtime once the config loads. You remain responsible for any
> consent/privacy obligations (GDPR, etc.) for the analytics you turn on.

---

## Icons

Each service shows a [Phosphor](https://phosphoricons.com) icon (duotone weight).
Pick any icon from phosphoricons.com and use its class name with the `ph-`
prefix (Velvet adds the `ph-duotone` weight for you).

```yaml
velvet:
  icons:
    frontend: ph-globe          # key = service slug, value = ph-<icon>
    "developer-site": ph-code   # quote slugs that contain a hyphen
```

- **Key** = the service [slug](#how-the-slug-works).
- **Value** = a Phosphor class like `ph-globe`, `ph-database`, `ph-gear-six`.
- Overrides win over the built-in defaults below; unknown slugs fall back to `ph-circle`.

Built-in defaults (used when you don't override a slug):

| slug | icon |
| --- | --- |
| `frontend` | `ph-globe` |
| `api` | `ph-brackets-curly` |
| `backend` | `ph-gear-six` |
| `dashboard` | `ph-gauge` |
| `database` | `ph-database` |
| `email` | `ph-envelope-simple` |
| `developer-site` | `ph-code` |
| _(anything else)_ | `ph-circle` |

---

## Separate IPv4 / IPv6 monitoring

A plain check runs from the GitHub runner, which is IPv4-only. To check IPv6, route it through [Globalping](https://globalping.io) (`type: globalping`), whose probes are dual-stack. Choose per service:

**IPv4 only**, using a normal check:

```yaml
- name: Frontend
  url: https://example.com
```

**IPv6 only**, using one Globalping check. End the name in `IPv6` (slug `<x>-ipv6`) so Velvet shows an `IPv6` pill:

```yaml
- name: Mail IPv6
  url: https://mail.example.com
  type: globalping
  check: http
  ipv6: true
```

**Both, in one card**, using the normal check plus a sibling whose slug ends in `-ipv6`:

```yaml
- name: API
  url: https://api.example.com
- name: API IPv6        # slug "api-ipv6" → folded into the "api" card
  url: https://api.example.com
  type: globalping
  check: http
  ipv6: true
```

The compatibility adapter folds an `<base>-ipv6` entry into its `<base>` Velvet service: the card header shows `IPv4` / `IPv6` pills with status dots and the expanded detail lists both protocols. A standalone `<x>-ipv6` (no base) renders as an IPv6-only card; a plain check renders with no protocol pills.

**Requirements:** add a `GLOBALPING_TOKEN` repository secret. Register at globalping.io and create a token under "Tokens" to lift the rate limit from 250 to 500 checks per hour. Cloud runners share IPs, so the unauthenticated limit is easy to hit. Globalping supports HTTP and PING checks only, not POST.

## Deployment notes

These are repo settings, not `.upptimerc.yml` fields, but you need them for the
page to go live:

1. **`GH_PAT` secret**: a classic Personal Access Token with `repo` + `workflow`
   scopes. Upptime commits monitoring data and runs the workflows with it.
2. **Pages source = "GitHub Actions"**: Settings → Pages → Build and deployment →
   Source. Velvet deploys with the official Pages action; this bypasses the
   `gh-pages` branch so Upptime's stock page can't overwrite it.
3. If Upptime's **Static Site CI** / **Setup CI** push a stock page, disable them.

---

## SEO & crawlers

The page is fully indexable out of the box, with **no configuration required**. On
each deploy Velvet derives the public URL (your `cname`, else the GitHub Pages
URL) and writes, into the built site:

- a per-deployment `<title>`, meta `description`, `robots: index, follow`,
  `canonical`, and **Open Graph + Twitter Card** tags,
- an **auto-generated 1200×630 social card** (`og.png`) that mirrors the page,
  including the brand or logo, overall status, and first service with its uptime bar, used
  as the `og:image` / `twitter:image` (with `og:image:width/height/type` set so
  iMessage, Slack, etc. render a large preview),
- a `robots.txt` that allows all crawlers and points at the sitemap,
- a `sitemap.xml`.

Because Velvet is a client-rendered app, these static tags are what non-JS
crawlers and social-card scrapers read; JS-capable crawlers (e.g. Googlebot)
additionally render the live status content.

**Overrides.** Everything above is auto-derived; you only override what you want
to change via the [`velvet.seo`](#status-websitevelvet-velvet-appearance) block:

```yaml
status-website:
  velvet:
    seo:
      title: "Acme System Status"               # default: generated from the status name
      description: "Real-time uptime for Acme."  # default: current status plus a line built from name
      image: "https://acme.example/og.png"       # default: the auto-generated 1200×630 status card
```

---

## Full Upptime reference

For monitoring options Velvet doesn't touch, including schedules, notification channels
(Slack, Telegram, email, etc.), `assignees`, `i18n`, `commitMessages`, and more,
see the [official Upptime configuration docs](https://upptime.js.org/docs/configuration).
