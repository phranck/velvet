# Velvet configuration reference

Velvet keeps page identity and appearance in **`.upptimerc.yml`** for compatibility
with existing [Upptime](https://upptime.js.org) repositories. Runtime status data
comes exclusively from the validated documents under `velvet-data/v1`.

This page documents **every field Velvet reads**, plus the Upptime fields you
need to monitor your services. Upptime has many more options (notifications,
schedules, assignees, i18n, commit messages, …) that keep working for
monitoring; they just don't affect Velvet's appearance. For those, see the
[Upptime configuration docs](https://upptime.js.org/docs/configuration).

> **Velvet vs. the stock Upptime page.** Velvet replaces Upptime's built-in
> Svelte/Sapper page. That means the stock `status-website` appearance fields
> (`theme`, `themeUrl`, `introTitle`, `introMessage`, `customHeadHtml`,
> `customBodyHtml`, `customFootHtml`, `favicon`, `faviconSvg`, `scripts`, `js`,
> `links`, `css`, `metaTags`) have **no effect** with Velvet — see
> [Fields Velvet ignores](#fields-velvet-ignores). Use the
> [`velvet:` block](#status-websitevelvet--velvet-appearance) instead.

---

## Minimal config

The smallest file that produces a working page:

```yaml
owner: your-username
repo: your-status-repo

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

Both are required — Velvet's config generator throws without them.

---

## `sites:` — what to monitor

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
| `icon` | Upptime's own favicon field — **ignored by Velvet** (Velvet uses Phosphor icons via [`velvet.icons`](#icons)). | — |
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

## `status-website:` — page identity

| Field | Description | Example |
| --- | --- | --- |
| `name` | Brand name shown next to the logo. Also the browser tab title (`<name> — Status`). Defaults to `repo`. | `Example` |
| `logoUrl` | URL of a logo image shown top-left. If set, the **logo is shown instead of the name text**, and it links to `/`. | `https://example.com/logo.svg` |
| `cname` | Custom domain. Velvet writes a `CNAME` file into the build so the domain survives each deploy. | `status.example.com` |
| `navbar` | Links shown top-right. Each is `{ title, href }`. `$OWNER`/`$REPO` are substituted. Use `navbar: []` for none — the logo still links to `/`. Defaults to a single `Status → /` link. | see below |

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
Velvet's look through the [`velvet:` block](#status-websitevelvet--velvet-appearance)
instead. (`baseUrl`, `robotsText`, `publish`, `apiBaseUrl`, `userContentBaseUrl`
are infrastructure fields Upptime still honours.)

---

## `status-website.velvet:` — Velvet appearance

All Velvet-specific options live here, so the file stays a valid Upptime config.

```yaml
status-website:
  velvet:
    layout: cards
    # logoHeight: 44
    # defaultRange: 30d      # range pre-selected on first visit (24h/7d/30d/90d/1yr)
    # showPoweredBy: true   # footer "Powered by" credit
    # showSubscribe: true   # footer Subscribe (RSS) link
    theme:
      grid:
        operational: "#6366f1"
        degraded: "#d29922"
        outage: "#f85149"
        noData: "#1c2029"
      protocol:
        ipv4: "#7c7ef3"
        ipv6: "#38bdf8"
      background:
        start: "#0e1018"
        end: "#0a0b0f"
        blobs:
          enabled: true
          count: 3
          colors:
            - "#6366f1"
            - "#7c7ef3"
      card:
        background: "#0e1015"
        border: "#1c2029"
        separator: "#14171f"
        borderEnabled: true
      accent: "#6366f1"
      text:
        primary: "#e8eaed"
        secondary: "#8b919b"
        tertiary: "#565b65"
    # fontSans: "Inter"
    # fontMono: "JetBrains Mono"
    # dataBranch: main
    # dataBaseUrl: https://cdn.example/status/velvet-data/v1
    # Analytics (optional) — a tracker is injected only when configured:
    # umami:
    #   websiteId: "xxxxxxxx-xxxx-xxxx-xxxx"
    #   src: "https://analytics.example.com/script.js"
    # googleAnalytics: "G-XXXXXXXXXX"
    # SEO overrides (optional) — every field is auto-derived by default:
    # seo:
    #   title: "Acme System Status"               # default: "<name> — Status"
    #   description: "Real-time uptime for Acme."  # default: a line built from name
    #   image: "https://acme.example/og.png"       # default: the auto-generated status card
    icons:
      frontend: ph-globe
      backend: ph-gear-six
```

| Field | Default | Description |
| --- | --- | --- |
| `layout` | `grouped` | `grouped` puts all services in one card; `cards` gives each service its own card. Any value other than `cards` is treated as `grouped`. |
| `logoHeight` | `72` | Logo height in pixels (width scales proportionally) — raise it for a taller logo. |
| `defaultRange` | `30d` | History window pre-selected on a visitor's first visit. Accepts a label (`24h`, `7d`, `30d`, `90d`, `1yr`) or the internal key (`day`, `week`, `month`, `quarter`, `year`). Once a visitor picks a range it is remembered and wins over this default. |
| `showPoweredBy` | `true` | Show the "Powered by Velvet" credit in the footer. |
| `showSubscribe` | `true` | Show the Subscribe (RSS) link in the footer. When only one of the two footer items is shown, it is centered; when neither is, the footer is omitted. |
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

All theme colours live under `status-website.velvet.theme`. Omitted values use
the defaults shown in the example above.

| Field | Description |
| --- | --- |
| `grid.operational` | Uptime segments and status indicators for healthy checks. |
| `grid.degraded` | Uptime segments and status indicators for degraded checks. |
| `grid.outage` | Uptime segments and status indicators for outages. |
| `grid.noData` | Uptime segments and status indicators without data. |
| `protocol.ipv4` | IPv4 labels, chart legend, and solid response-time curve. |
| `protocol.ipv6` | IPv6 labels, chart legend, and dashed response-time curve. |
| `background.start` | Top colour of the vertical page gradient. |
| `background.end` | Bottom colour of the vertical page gradient. |
| `background.blobs.enabled` | Enables or disables the cloudy background blobs. |
| `background.blobs.count` | Number of blobs, clamped to `1`–`5`. Their stable positions are distributed from the repository identity. |
| `background.blobs.colors` | Exactly two colours, alternated across the blobs. |
| `card.background` | Card background colour. |
| `card.border` | Card border colour. |
| `card.separator` | Separator-line colour inside and between cards. |
| `card.borderEnabled` | Enables or disables card outlines without removing separators. |
| `accent` | Interactive controls, focus states, and highlighted links. |
| `text.primary` | Main headings, service names, and primary values. |
| `text.secondary` | Supporting labels and secondary values. |
| `text.tertiary` | Range labels, footer text, and low-emphasis copy. |

Response-time curves use monotone cubic interpolation. This smooths the graph
without inventing values beyond local extrema; unavailable samples still split
the curve into visible gaps.

The former top-level Velvet fields `accent`, `accentDeg`, and `accentDown`
remain supported for existing configurations. New configurations should use
`theme.accent`, `theme.grid.degraded`, and `theme.grid.outage`.

> **Font note.** `fontSans`/`fontMono` only change the CSS font-family. Velvet
> loads **Inter** and **JetBrains Mono** itself; to use a different family,
> ensure it's available to the browser (e.g. a system font, or add an
> `@import`/`<link>` — note that custom `<head>` HTML is not configurable via
> `.upptimerc.yml` with Velvet).

> **Analytics note.** `umami` and `googleAnalytics` are independent — enable
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

**IPv4 only** — a normal check:

```yaml
- name: Frontend
  url: https://example.com
```

**IPv6 only** — one Globalping check; end the name in `IPv6` (slug `<x>-ipv6`) so Velvet shows an `IPv6` pill:

```yaml
- name: Mail IPv6
  url: https://mail.example.com
  type: globalping
  check: http
  ipv6: true
```

**Both, in one card** — the normal check plus a sibling whose slug ends in `-ipv6`:

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

**Requirements:** add a `GLOBALPING_TOKEN` repo secret — register free at globalping.io, create a token under "Tokens" — to lift the rate limit from 250 to 500 checks/hour (cloud runners share IPs, so the unauthenticated limit is easy to hit). Globalping supports HTTP and PING checks only, no POST.

## Deployment notes

These are repo settings, not `.upptimerc.yml` fields, but you need them for the
page to go live:

1. **`GH_PAT` secret** — a classic Personal Access Token with `repo` + `workflow`
   scopes. Upptime commits monitoring data and runs the workflows with it.
2. **Pages source = "GitHub Actions"** — Settings → Pages → Build and deployment →
   Source. Velvet deploys with the official Pages action; this bypasses the
   `gh-pages` branch so Upptime's stock page can't overwrite it.
3. If Upptime's **Static Site CI** / **Setup CI** push a stock page, disable them.

---

## Subscribe / incident feed

Velvet builds a static Atom feed at **`/incidents.atom`** from the validated
`velvet-data/v1/incidents.json` document and links it from a **Subscribe**
button. The compatibility adapter is responsible for converting source incidents
into that presentation-independent event model.

---

## SEO & crawlers

The page is fully indexable out of the box — **no configuration required**. On
each deploy Velvet derives the public URL (your `cname`, else the GitHub Pages
URL) and writes, into the built site:

- a per-deployment `<title>`, meta `description`, `robots: index, follow`,
  `canonical`, and **Open Graph + Twitter Card** tags,
- an **auto-generated 1200×630 social card** (`og.png`) that mirrors the page — the
  brand/logo, the overall status, and the first service with its uptime bar — used
  as the `og:image` / `twitter:image` (with `og:image:width/height/type` set so
  iMessage, Slack, etc. render a large preview),
- a `robots.txt` that allows all crawlers and points at the sitemap,
- a `sitemap.xml`.

Because Velvet is a client-rendered app, these static tags are what non-JS
crawlers and social-card scrapers read; JS-capable crawlers (e.g. Googlebot)
additionally render the live status content.

**Overrides.** Everything above is auto-derived; you only override what you want
to change via the [`velvet.seo`](#status-websitevelvet--velvet-appearance) block:

```yaml
status-website:
  velvet:
    seo:
      title: "Acme System Status"               # default: "<name> — Status"
      description: "Real-time uptime for Acme."  # default: current status plus a line built from name
      image: "https://acme.example/og.png"       # default: the auto-generated 1200×630 status card
```

---

## Full Upptime reference

For monitoring options Velvet doesn't touch — schedules, notification channels
(Slack, Telegram, email, …), `assignees`, `i18n`, `commitMessages`, and more —
see the [official Upptime configuration docs](https://upptime.js.org/docs/configuration).
