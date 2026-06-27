# Velvet configuration reference

Velvet builds your status page from a single file: **`.upptimerc.yml`**. It is a
standard [Upptime](https://upptime.js.org) config — Velvet reads the same file
and only changes how the page **looks**.

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
| `owner` | **yes** | GitHub user or org that owns the monitoring repo. Velvet reads `history/summary.json` and incident issues from here. |
| `repo` | **yes** | The monitoring repository name. |

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
    accent: "#6366f1"
    accentDeg: "#d29922"
    accentDown: "#f85149"
    # fontSans: "Inter"
    # fontMono: "JetBrains Mono"
    # dataBranch: main
    icons:
      frontend: ph-globe
      backend: ph-gear-six
```

| Field | Default | Description |
| --- | --- | --- |
| `layout` | `grouped` | `grouped` puts all services in one card; `cards` gives each service its own card. Any value other than `cards` is treated as `grouped`. |
| `accent` | `#6366f1` | Primary / **operational** colour (any hex). Drives the indigo theme and the "up" bars. |
| `accentDeg` | `#d29922` | **Degraded** colour (amber). |
| `accentDown` | `#f85149` | **Down** colour (red). |
| `fontSans` | `Inter` | Overrides the UI font (CSS `--font-sans`). See the note below. |
| `fontMono` | `JetBrains Mono` | Overrides the monospace font (CSS `--font-mono`). |
| `dataBranch` | `main` | Branch the monitoring data (`history/summary.json`) lives on. |
| `icons` | _(built-ins)_ | Per-slug Phosphor icon overrides. See [Icons](#icons). |

> **Font note.** `fontSans`/`fontMono` only change the CSS font-family. Velvet
> loads **Inter** and **JetBrains Mono** itself; to use a different family,
> ensure it's available to the browser (e.g. a system font, or add an
> `@import`/`<link>` — note that custom `<head>` HTML is not configurable via
> `.upptimerc.yml` with Velvet).

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

Velvet folds an `<base>-ipv6` entry into its `<base>` service: the card header shows `IPv4` / `IPv6` pills with status dots and the expanded detail lists both protocols. A standalone `<x>-ipv6` (no base) renders as an IPv6-only card; a plain check renders with no protocol pills.

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

Velvet builds a static Atom feed at **`/incidents.atom`** from the repo's GitHub
issues (Upptime opens one issue per incident) and links it from a **Subscribe**
button. A bundled workflow strips the emoji Upptime hardcodes into incident
issue titles. No configuration required.

---

## Full Upptime reference

For monitoring options Velvet doesn't touch — schedules, notification channels
(Slack, Telegram, email, …), `assignees`, `i18n`, `commitMessages`, and more —
see the [official Upptime configuration docs](https://upptime.js.org/docs/configuration).
