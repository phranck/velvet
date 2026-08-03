# Velvet configuration reference

`velvet.yml` is the canonical configuration for the GitHub-native Velvet
monitor, browser onboarding, Configurator, build Action, and status page. The
complete file is validated before Velvet checks an endpoint, changes an Issue,
or publishes generated data. Unknown fields are rejected.

## Minimal configuration

A normal website needs only a display name and URL. Velvet sends a direct IPv4
`GET` request and considers a final HTTP `200` healthy:

```yaml
schemaVersion: 1
repository:
  owner: your-username
  name: your-status-repo
statusPage:
  name: Example Status
services:
  - name: Website
    url: https://example.com
```

`repository.owner` and `repository.name` must match the repository in which the
workflow runs. A mismatch stops before any check or repository mutation.

## Top-level fields

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `schemaVersion` | yes | none | Configuration contract version, currently `1`. |
| `repository.owner` | yes | none | GitHub user or organization that owns the status repository. |
| `repository.name` | yes | none | Status repository name. |
| `statusPage` | yes | none | Public identity, presentation, navigation, and SEO. |
| `services` | yes | none | At least one public service with one or more HTTP checks. |
| `incidents` | no | see below | Confirmation thresholds and GitHub Issue labels. |
| `history` | no | see below | Retention policy for generated history. |
| `updates` | no | see below | Preference for compatible managed security updates. |

Stable service and check IDs are derived from their names as lowercase
kebab-case. Set an explicit `id` before renaming a service or check when its
historical identity must stay unchanged.

## Services and checks

### One website or endpoint

The compact service form creates one check whose ID and name are derived from
the service:

```yaml
services:
  - id: website
    name: Website
    url: https://example.com
```

### Several endpoints in one service

Use `checks` instead of `url` when one public service contains several named
endpoints. A service must use exactly one of these two forms.

```yaml
services:
  - id: api
    name: Public API
    checks:
      - id: readiness
        name: Readiness
        url: https://api.example.com/ready
      - id: version
        name: Version
        url: https://api.example.com/version
        method: HEAD
        expectedStatusCodes: [200, 204]
        maxRedirects: 2
        timeoutMs: 5000
```

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `services[].id` | no | derived | Stable lowercase kebab-case service ID, at most 64 characters. |
| `services[].name` | yes | none | Public service name, at most 128 characters. |
| `services[].url` | one form | none | Compact single-check URL. Cannot be combined with `checks`. |
| `services[].checks` | other form | none | One or more named checks. Cannot be combined with `url`. |
| `checks[].id` | no | derived | Stable lowercase kebab-case check ID, unique inside the service. |
| `checks[].name` | yes | none | Public check name. |
| `checks[].url` | yes | none | Absolute HTTP or HTTPS URL. Credentials and fragments are rejected. |
| `checks[].method` | no | `GET` | `GET` or `HEAD`. |
| `checks[].expectedStatusCodes` | no | `[200]` | One to 32 unique final status codes from `100` through `599`. |
| `checks[].maxRedirects` | no | `5` | Redirect limit from `0` through `10`. |
| `checks[].timeoutMs` | no | `10000` | Absolute timeout across all redirects, from `100` through `60000` ms. |
| `checks[].headers` | no | `[]` | Up to 16 header names with secret references. |
| `checks[].jsonAssertions` | no | `[]` | Up to 16 explicit JSON response assertions. |

Each check gets one initial attempt and at most one immediate retry. A status
response outside `expectedStatusCodes`, DNS or TLS failure, timeout, failed JSON
assertion, or invalid response counts as an unavailable measurement. Invalid
configuration, missing configured secrets, unsafe request setup, cancellation,
or an internal error aborts publication instead of reporting false downtime.

### Optional JSON health assertions

Status-only checks do not read or parse the body. Use `jsonAssertions` only when
an endpoint intentionally exposes structured application health:

```yaml
services:
  - name: API
    checks:
      - name: Application health
        url: https://api.example.com/health
        jsonAssertions:
          - path: /status
            equals: ok
          - path: /dependencies/database/ready
            equals: true
```

`path` is an RFC 6901 JSON Pointer. `equals` accepts a string, number, boolean,
or `null`. Every assertion must match. Velvet reads at most 64 KiB for an
asserted JSON response and never infers a schema from arbitrary content.

`HEAD` cannot be combined with JSON assertions because a `HEAD` response has no
body.

### Header secrets

Secret values never belong in `velvet.yml`. Reference only the environment
variable name:

```yaml
services:
  - name: Private API
    checks:
      - name: Health
        url: https://api.example.com/health
        headers:
          - name: Authorization
            secret: API_HEALTH_TOKEN
```

Map that repository secret explicitly into both monitor workflow steps:

```yaml
env:
  API_HEALTH_TOKEN: ${{ secrets.API_HEALTH_TOKEN }}
```

Do not pass all repository secrets to the Action. Secret interpolation such as
`$TOKEN` or `${TOKEN}` is rejected in configuration. Request-routing, framing,
and connection headers such as `Host`, `Content-Length`, and
`Transfer-Encoding` cannot be configured. Configured headers are removed on a
cross-origin redirect.

## Status page

```yaml
statusPage:
  name: Example Status
  customDomain: status.example.com
  logoUrl: https://example.com/logo.svg
  logoHeight: 72
  showPoweredBy: true
  layout: grouped
  defaultRange: 30d
  navigation:
    - title: Website
      href: https://example.com
  icons:
    website: ph-globe
```

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| `name` | yes | none | Public page name and default document title. |
| `customDomain` | no | GitHub Pages URL | Hostname only, without scheme, path, port, credentials, or wildcard. |
| `logoUrl` | no | none | Absolute HTTP(S) logo URL. |
| `logoHeight` | no | `72` | Display height from `16` through `256` px. |
| `showPoweredBy` | no | `true` | Shows the centered Powered by Velvet credit. |
| `layout` | no | `grouped` | `grouped` for one shared service card or `cards` for one card per service. |
| `defaultRange` | no | `30d` | Initial range: `24h`, `7d`, `30d`, `90d`, or `1yr`. A visitor's saved choice wins later. |
| `navigation` | no | `[]` | Up to 16 links with `title` and `href`. |
| `theme` | no | Velvet Default | Theme name plus optional semantic visual overrides. |
| `fonts.sans` | no | `Inter` | CSS font-family for normal interface text. |
| `fonts.mono` | no | `JetBrains Mono` | CSS font-family for times, values, and labels. |
| `icons` | no | automatic | Map of service ID to Phosphor icon class such as `ph-globe`. |
| `seo` | no | generated | Optional title, description, and social-image overrides. |

Setting `customDomain` writes a `CNAME` file into every build. The repository
setting alone does not change DNS. Add the required DNS record with the domain
provider and follow GitHub's
[custom-domain documentation](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages).
Do not remove the GitHub Pages domain until the custom domain resolves and its
certificate is active.

## Themes

Browser onboarding offers the four system themes as preview cards. The
Configurator can select the same themes and edit every field below afterward.
`theme.name` is required when a theme block exists.

```yaml
statusPage:
  name: Example Status
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
    chart:
      line: accent
      lineStyle: solid
      fill: true
      background: canvas
      backgroundOpacity: 0.2
    background:
      start: auto
      end: canvas
      blobs:
        enabled: true
        count: 3
        colors: [accent, alternate]
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
```

Every palette value is a six-digit hexadecimal color. A semantic color field
accepts `auto`, a palette key, or its own six-digit hexadecimal value.

| Group | Fields and accepted values |
| --- | --- |
| `palette` | `canvas`, `foreground`, `accent`, `alternate`, `warning`, `danger`, `textPrimary`, `textSecondary`, `textTertiary` |
| `grid` | `operational`, `degraded`, `outage`, `noData` |
| `chart` | `line`; `lineStyle` as `solid`, `dashed`, or `dotted`; `fill`; `background`; `backgroundOpacity` from `0` through `1` |
| `background` | `start`, `end`; `blobs.enabled`; `blobs.count` from `1` through `5`; exactly two `blobs.colors` |
| `card` | `background`, `border`, `separator`; `borderEnabled`; `shadowEnabled`; `radius` and `padding` from `0` through `32`; `maxWidth` as `640`, `760`, `920`, or `1080` |
| `headline` | `start`, `end` |
| `service` | `icon` |
| `text` | `primary`, `secondary`, `tertiary` |

Response-time curves use monotone cubic interpolation without inventing values
beyond local extrema. Unavailable samples remain visible gaps.

### Service icons

`statusPage.icons` maps the stable service ID to a
[Phosphor](https://phosphoricons.com) class. The browser setup and Configurator
offer the supported set visually. Unknown services use `ph-circle`.

```yaml
statusPage:
  name: Example Status
  icons:
    website: ph-globe
    api: ph-brackets-curly
    database: ph-database
```

### Analytics and SEO

```yaml
statusPage:
  name: Example Status
  seo:
    title: Example System Status
    description: Current availability for Example.
    image: https://example.com/status-social.png
```

Velvet offers no analytics. A generated status page loads no third-party script
and reports to nobody, and there is no setting that would make it.

Without SEO overrides, each build derives the title, description, canonical
URL, Open Graph and Twitter metadata, a 1200 x 630 social card, `robots.txt`,
and `sitemap.xml` from the page configuration and latest validated status.

## Incidents and maintenance

```yaml
incidents:
  failureThreshold: 2
  recoveryThreshold: 2
  incidentLabel: incident
  maintenanceLabel: maintenance
```

| Field | Default | Accepted values |
| --- | --- | --- |
| `failureThreshold` | `2` | Consecutive failed measurements from `1` through `20`. |
| `recoveryThreshold` | `2` | Consecutive successful measurements from `1` through `20`. |
| `incidentLabel` | `incident` | Lowercase kebab-case GitHub label. |
| `maintenanceLabel` | `maintenance` | Lowercase kebab-case GitHub label. |

A first failed measurement is pending and appears degraded. Reaching the
failure threshold confirms the outage and opens one marked GitHub Issue. A
recovered target counts as available immediately, while the displayed state
waits for the recovery threshold. Confirmed recovery adds one comment and
closes the same Issue. Manual closure during an active outage is reconciled by
reopening the marked Issue; unrelated Issues are never changed.

Planned maintenance is submitted through the generated Issue Form or the
maintenance workflow. Velvet validates the selected service IDs and timestamps.
Monitoring continues during maintenance. Covered outages do not create an
incident until the maintenance window ends, but measured availability is never
rewritten. Scheduled, active, and completed maintenance remains a neutral event
in public history.

## History and generated data

```yaml
history:
  retentionDays: 365
```

`retentionDays` accepts `1` through `365` and defaults to `365`. The same window
applies to public daily availability, response samples, resolved incidents,
completed maintenance, private transition history, and generated branch
history. Open incidents and scheduled or active maintenance remain visible.
Historical GitHub Issues are never deleted.

The monitor owns only these paths on the dedicated `velvet-data` branch:

- `.velvet/monitor-state.json`
- `velvet-data/v1/status.json`
- `velvet-data/v1/response-times.json`
- `velvet-data/v1/incidents.json`

Status and response workflows share the `velvet-status-data` concurrency group.
Every successful run validates and publishes one complete commit. An unchanged
or failed partial result never replaces the latest valid snapshot. Once the
retained Git history reaches beyond the configured period, the current complete
snapshot becomes a new root, written against the exact branch head the run read,
so a run working from an outdated view is refused rather than applied. The
default branch is never force-pushed.

## Managed updates

```yaml
updates:
  automaticSecurityUpdates: true
```

`automaticSecurityUpdates` defaults to `true`. The preference applies only to
releases explicitly classified as security updates that require neither a
configuration migration nor a data migration. Feature releases, fixes without
that classification, and incompatible schema changes always require
confirmation.

### How a release is classified

Every release carries one of three classifications, and the classification must
match how the version number moves. Publication is refused when they disagree,
so a release cannot be labelled to make it look safer than it is.

| Type | Version change | Meaning |
| --- | --- | --- |
| `security` | Patch only | Closes a security weakness |
| `fix` | Patch only | Corrects behaviour |
| `feature` | Major or minor | Adds or changes capability |

### What may install without asking

A release installs unattended only when every one of these holds. Any single
failure means it waits for confirmation.

- It is classified `security`.
- It is explicitly marked eligible for automatic installation. The marking
  alone is not enough; a release marked eligible whilst not being a
  migration-free security release is rejected at publication.
- It requires neither a configuration migration nor a data migration.
- Your installation still has `automaticSecurityUpdates` enabled.
- Its recorded template revision is immutable, and every file matches the hash
  the release recorded for it.

An automatic update that fails is not retried for that version. It will not
open the same branch or pull request again and again.

### What an update never touches

The update contract works from an immutable template commit and a closed list
of Velvet-owned workflow and Issue-template files, plus the machine-managed
`velvet.lock.json`. Everything else is yours and is never an update target:
`velvet.yml`, the complete `velvet-data` branch, incidents, maintenance
history, repository secrets, Pages and domain settings, `README.md`, and
`LICENSE`.

This is proven rather than promised. Before merging, Velvet reads the changed
files of its own pull request, including both sides of a rename, and stops
whilst your installation is still untouched if any path falls outside that
closed set. It also refuses to run at all against a repository whose default
branch is the generated `velvet-data` history.

The `velvet-data` branch is verified by existence rather than by comparison,
because the monitor rewrites it on its own schedule and replaces it with an
unrelated root commit whenever it compacts elder history. Comparing commits
would raise false alarms on a perfectly healthy installation.

Repository secrets are protected by absence of capability rather than by
policy. The update token carries no permission that can read or write them.

### What Velvet is allowed to do to your repository

Updates use a token restricted to exactly one verified repository, requesting
Actions read and write, Checks read, Contents write, Pull requests write, and
Workflows write. It holds no Administration, Pages, Issues, Secrets,
organisation, or account permission.

Granting these is a one-time approval. Velvet cannot widen its own access
afterwards, because the permissions come from the app registration you
approved.

### When something goes wrong

A failed check before merging leaves your installation completely unchanged.
Nothing was merged, so there is nothing to undo.

If publication fails after merging, Velvet restores the previous managed files
with a normal new commit and publishes them again. History is never rewritten
and nothing is force-pushed, so your commit history stays intact and readable.

An interrupted operation resumes from what the repository actually shows rather
than from remembered state, so a restart in the middle of an update cannot
leave it half applied. Repeating a request that already succeeded does nothing.

Every failure reports a stable code, a message safe to show, and a unique error
ID you can quote. The full cause is recorded in Velvet's logs, which never
contain credentials, secret values, configuration content, or your status data.

## GitHub workflows and permissions

An installation carries these workflows. Their essential access is:

| Workflow | Purpose | Permissions |
| --- | --- | --- |
| Velvet status | Five-minute checks, availability, incidents, maintenance | `contents: write`, `issues: write` |
| Velvet response times | Samples at 00:00, 06:00, 12:00, 18:00 UTC | `contents: write` |
| Velvet Pages | Build and deploy after valid data publication | `contents: read`, `pages: write`, `id-token: write` |

All installed third-party Actions and Velvet Actions are pinned to immutable
commit IDs. Monitoring workflows do not run for pull requests or untrusted fork
content. They use the repository-scoped `GITHUB_TOKEN`; no personal access token
is required for ordinary monitoring or publishing.

After changing services, update the choices in
`.github/ISSUE_TEMPLATE/maintenance.yml` so its labels and embedded IDs match
`velvet.yml`. Browser setup does this during installation.

## Failure and recovery

Velvet distinguishes endpoint downtime from failures that make the measurement
unreliable:

- HTTP, DNS, TLS, timeout, assertion, or final-status failures are valid endpoint
  measurements.
- Invalid configuration, missing secrets, unsafe request setup, invalid state or
  output, cancellation, and internal failures stop publication.
- GitHub errors expose a stable safe code and unique error ID. Logs never contain
  endpoint URLs, secret names or values, authorization headers, request bodies,
  or raw GitHub responses.
- A safe data-branch conflict is retried once against the newer state. A stale
  run stops without overwriting it.

Correct the reported configuration, permission, secret mapping, or temporary
GitHub failure, then rerun the failed workflow. The previous snapshot remains
public throughout recovery. Never hand-edit one generated document or assemble
a partial replacement.

## IPv4 and IPv6

Velvet performs direct HTTP(S) checks over IPv4, because GitHub-hosted runners
do not provide documented IPv6 connectivity. A configured service is therefore
monitored over IPv4, and the configuration offers no external-probe option.
IPv6 monitoring will be added once those runners support it for every
installation.

## Build Action

The page Action defaults to these paths:

```yaml
- name: Build Velvet site
  uses: phranck/velvet@<full-commit-sha>
  with:
    config: velvet.yml
    data: .velvet-data/velvet-data/v1
    output: velvet-dist
```

The workflow must check out the default branch and the generated `velvet-data`
branch at `.velvet-data` first. The Action validates the configuration and data,
builds the static site, generates SEO and social assets, and copies license
notices into the output directory.

## Licensing and generated-data policy

Velvet's MIT license covers its code, schemas, and original assets. The
monitoring records an installation produces, along with any logos, fonts, and
other third-party material it displays, keep their own rights and notices. The
monitor never deletes a closed GitHub Issue or a license file it finds in the
repository. See [LICENSING.md](../LICENSING.md) and
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for the complete boundary.
