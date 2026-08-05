# Velvet configuration reference

`velvet.yml` describes your whole installation. Velvet is GitHub-native, so this one file is all there is: the monitor, the browser setup, the Configurator, the build Action, and the status page all read it.

Velvet checks the whole file before it does anything. If something is wrong, it stops before checking an endpoint, touching an Issue, or publishing data. A field Velvet does not know is an error rather than something it ignores.

## Minimal configuration

An ordinary website needs a name and a URL, and nothing else. Velvet sends a `GET` request over IPv4 and treats a final HTTP `200` as healthy.

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

`repository.owner` and `repository.name` have to name the repository the workflow is running in. If they name a different one, Velvet stops there, before checking anything or writing anything.

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

If you give a service or a check no `id`, Velvet makes one from its name, in lowercase with dashes. That id is what its history is filed under. So if you rename something later, give it an explicit `id` first, or its history starts again under the new name.

## Services and checks

### One website or endpoint

Give the service a `url` and Velvet makes one check from it, taking the check's name and id from the service.

```yaml
services:
  - id: website
    name: Website
    url: https://example.com
```

### Several endpoints in one service

When one service has several endpoints worth showing separately, list them under `checks` instead of giving the service a `url`. A service uses one of the two forms, never both.

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

Velvet tries each check once, and once more straight away if the first attempt fails.

Some failures mean your endpoint was unavailable, and Velvet records them as such. Those are an unexpected status code, a DNS or TLS failure, a timeout, a failed JSON assertion, and a response Velvet cannot make sense of.

Other failures mean Velvet itself could not do its job, and it publishes nothing rather than claim your endpoint was down. Those are a broken configuration, a secret it was told to use and cannot find, a request it considers unsafe to send, a cancelled run, and an internal error.

### Optional JSON health assertions

By default Velvet looks at the status code and stops there. It does not read the response body at all.

Use `jsonAssertions` when an endpoint deliberately reports its own health as JSON and you want that checked too.

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

`path` is a JSON Pointer, as described in RFC 6901. `equals` takes a string, a number, a boolean, or `null`. Every assertion has to match, or the check counts as failed.

Velvet reads at most 64 KiB of the response and compares only the paths you named. It never guesses at the rest.

A check using `HEAD` cannot have JSON assertions, because a `HEAD` response has no body to read.

### Header secrets

Never put a secret value in `velvet.yml`. Name the environment variable that holds it instead.

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

Then map that repository secret into both steps of the monitor workflow:

```yaml
env:
  API_HEALTH_TOKEN: ${{ secrets.API_HEALTH_TOKEN }}
```

Pass only the secrets a check needs, not all of them.

Writing a value into `velvet.yml`, in any form, is refused. That includes `$TOKEN` and `${TOKEN}`: the file holds the name of an environment variable and nothing else.

Some headers cannot be set at all, because they decide how the request itself is routed and framed. `Host`, `Content-Length`, and `Transfer-Encoding` are the ones you are most likely to reach for.

If a check follows a redirect to another origin, Velvet drops your headers before sending the next request, so a token cannot travel to a host you did not name.

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
| `logoUrl` | no | none | The logo shown instead of the page name. Either an absolute HTTP(S) address, or a file in this repository written as `./logo.svg`. The browser setup uploads one for you and writes it here. |
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

Setting `customDomain` puts a `CNAME` file into every build. That is all it does. Your domain still has to point at GitHub, which means adding a DNS record at whoever you bought the domain from. GitHub's [custom-domain documentation](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages) explains which record.

Keep the GitHub Pages address working until your own domain answers and its certificate is live. Removing it earlier takes your page offline in between.

## Themes

The browser setup shows the four system themes as cards you can pick from. The Configurator offers the same four and lets you change every field below afterwards.

If you write a `theme` block yourself, it has to have a `name`.

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

Each value in `palette` is a six-digit hexadecimal colour.

Every other colour field takes one of three things: `auto`, so Velvet picks; the name of a palette entry, so it follows that colour; or a six-digit hexadecimal colour of its own.

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

The response-time chart draws a smooth curve through the measurements, and the curve never rises above the highest one or falls below the lowest. Where a measurement is missing, the line breaks rather than being drawn across the gap.

### Service icons

`statusPage.icons` gives a service its icon, by mapping the service's id to a [Phosphor](https://phosphoricons.com) class name. The browser setup and the Configurator let you pick from the supported icons rather than typing a class.

A service with no icon named here gets `ph-circle`.

```yaml
statusPage:
  name: Example Status
  icons:
    website: ph-globe
    api: ph-brackets-curly
    database: ph-database
```

### SEO

```yaml
statusPage:
  name: Example Status
  seo:
    title: Example System Status
    description: Current availability for Example.
    image: https://example.com/status-social.png
```

Velvet offers no analytics. A generated status page loads no third-party script and reports to nobody, and there is no setting that would make it.

Set nothing here and each build works it all out for you, from your page's configuration and its latest status: the title, the description, the canonical URL, the Open Graph and Twitter metadata, a 1200 by 630 social card, `robots.txt`, and `sitemap.xml`.

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

One failed measurement is not yet an outage. The page shows the service as degraded and waits. When the failures reach `failureThreshold` in a row, Velvet confirms the outage and opens one GitHub Issue for it.

Recovery works the same way round. The moment the endpoint answers again, that measurement counts as available in your history. The page keeps showing the outage until the successes reach `recoveryThreshold`, and then Velvet comments on the Issue and closes it.

If you close that Issue yourself whilst the outage is still going on, Velvet reopens it. It only ever touches the Issue it opened, never anything else in your repository.

You announce planned maintenance through the Issue Form in your repository, or through the maintenance workflow. Velvet checks that the services you named exist and that the times make sense.

Monitoring carries on during the window. If the service goes down inside it, Velvet opens no incident, but it still records what it measured: your availability figures are never adjusted to be kinder.

Maintenance shows on the page as its own kind of event, before, during, and after, and it is not counted as trouble.

## History and generated data

```yaml
history:
  retentionDays: 365
```

`retentionDays` is how far back your page reaches. It takes a number from `1` through `365` and defaults to `365`.

The same window applies to everything Velvet keeps: daily availability, response samples, closed incidents, finished maintenance, and its own record of what changed when.

Two things are never dropped for being old. An incident that is still open and maintenance that is scheduled or under way both stay visible. And Velvet never deletes a GitHub Issue, whatever its age.

The monitor owns only these paths on the dedicated `velvet-data` branch:

- `.velvet/monitor-state.json`
- `velvet-data/v1/status.json`
- `velvet-data/v1/response-times.json`
- `velvet-data/v1/incidents.json`

The two workflows that write data never run at the same time, so they cannot overwrite each other.

A run publishes one commit with everything in it, and only after checking that everything is there. A run that failed part-way, or that found nothing had changed, publishes nothing and leaves the last good data in place.

When the branch history grows past your retention window, Velvet starts it again from the current data. It writes that against the exact commit it read, so a run working from an out-of-date view is refused instead of applied.

Your default branch is never force-pushed.

## Being named on the Velvet website

```yaml
gallery:
  listed: true
```

Off unless you say otherwise. With it on, your status page is named at [velvet.li/references](https://velvet.li/references/), and the browser setup asks you this during the first step so nothing is listed without being asked. The Configurator changes the answer at any time, and withdrawing takes effect within the hour.

Velvet discloses your page name and its address, and nothing else. Whether the repository behind it is public or private makes no difference.

## Managed updates

```yaml
updates:
  automaticSecurityUpdates: true
```

`automaticSecurityUpdates` is on by default.

It covers one narrow case: a release that fixes a security problem and needs no change to your configuration or your data. Everything else waits for you to say yes. That includes new features, ordinary fixes, and anything that changes the shape of the configuration.

### How a release is classified

Every release says what kind of release it is, and the version number has to agree. If the two disagree, the release is refused before it is published, so nobody can label a feature release as a security fix to slip it past you.

| Type | Version change | Meaning |
| --- | --- | --- |
| `security` | Patch only | Closes a security weakness |
| `fix` | Patch only | Corrects behaviour |
| `feature` | Major or minor | Adds or changes capability |

### What may install without asking

All of the following have to be true. If any one of them is not, the release waits for you.

- It is classified `security`.
- It is marked as suitable for automatic installation. Marking it is not enough on its own: a release that carries the mark without meeting the other conditions is refused at publication.
- It requires neither a configuration migration nor a data migration.
- Your installation still has `automaticSecurityUpdates` enabled.
- Its recorded template revision is immutable, and every file matches the hash the release recorded for it.

If an automatic update fails, Velvet does not try that version again. You will not find the same branch and pull request reappearing.

### What an update never touches

An update may change a fixed list of files, and nothing else. That list is the workflows Velvet installed, the Issue templates it installed, and `velvet.lock.json`, which it maintains for you.

Everything else is yours and is never touched: `velvet.yml`, the whole `velvet-data` branch, your incidents and maintenance history, your repository secrets, your Pages and domain settings, your `README.md`, and your `LICENSE`.

Velvet does not simply promise this. Before merging its own pull request it reads the list of files that request changes, renames included, and if a single path is not on the allowed list it stops there. Nothing has been merged at that point, so your installation is exactly as it was. It also refuses to run at all in a repository whose default branch is the generated `velvet-data` history.

For the `velvet-data` branch it checks only that the branch is still there, rather than comparing commits. The monitor rewrites that branch on its own schedule, so comparing would report trouble on a perfectly healthy installation.

Your repository secrets are safe because Velvet cannot reach them at all. The token it uses for updates has no permission to read or write a secret.

### What Velvet is allowed to do to your repository

Updates use a token that works on one repository, the one you approved, and nothing else. It can read and write Actions, read Checks, write Contents, write Pull requests, and write Workflows.

It cannot touch anything to do with administration, Pages, Issues, secrets, your organisation, or your account.

You approve this once. Velvet cannot give itself more later, because the permissions come from the app registration you agreed to and not from anything it controls.

### When something goes wrong

If a check fails before merging, your installation is untouched. Nothing was merged, so there is nothing to undo.

If something fails after merging, Velvet puts the previous files back with an ordinary new commit and publishes them again. It never rewrites history and never force-pushes, so your commit log stays readable and nothing disappears from it.

If an update is interrupted, whatever picks it up afterwards looks at what your repository actually contains rather than at what it remembers doing. So a restart in the middle cannot leave an update half applied, and asking twice for something that already worked does nothing the second time.

Every failure gives you a code, a message that is safe to show anyone, and an error ID you can quote when asking about it. The detail goes into Velvet's own logs, which never contain credentials, secret values, your configuration, or your status data.

## GitHub workflows and permissions

Your installation has three workflows. This is what each one does and what it needs to be allowed to do:

| Workflow | Purpose | Permissions |
| --- | --- | --- |
| Velvet status | Five-minute checks, availability, incidents, maintenance | `contents: write`, `issues: write` |
| Velvet response times | Samples at 00:00, 06:00, 12:00, 18:00 UTC | `contents: write` |
| Velvet Pages | Build and deploy after valid data publication | `contents: read`, `pages: write`, `id-token: write` |

Every Action these workflows use, Velvet's own and anyone else's, is pinned to an exact commit, so none of them can change under you.

The monitoring workflows never run on a pull request or on code from a fork. They use the `GITHUB_TOKEN` that GitHub gives a workflow in its own repository, so ordinary monitoring and publishing need no personal access token from you.

When you add or rename a service, update the list of choices in `.github/ISSUE_TEMPLATE/maintenance.yml` to match, or the maintenance form will offer the old names. The browser setup writes that file for you at installation.

## Failure and recovery

Velvet separates two things that both look like failure: your endpoint being down, and Velvet being unable to measure it properly.

Your endpoint was down when the request failed at HTTP, DNS, or TLS level, timed out, returned an unexpected status, or failed a JSON assertion. Velvet records those.

Velvet could not measure when the configuration is wrong, a secret is missing, the request would be unsafe to send, its own state or output does not check out, the run was cancelled, or something inside it went wrong. It publishes nothing in those cases rather than claim you were down.

When GitHub itself is the problem, you get a code and an error ID. The logs never contain your endpoint URLs, secret names or values, authorization headers, request bodies, or GitHub's raw replies.

If two runs collide on the data branch and it is safe to do so, Velvet tries once more against the newer state. A run working from an out-of-date view stops instead of overwriting what is there.

To recover, fix what was reported, whether that is the configuration, a permission, a secret mapping, or a passing GitHub outage, and rerun the workflow that failed. Your page keeps showing the last good data throughout. Do not edit a generated file by hand or piece one together yourself.

## IPv4 and IPv6

Velvet checks your endpoints over IPv4. GitHub's runners offer no documented IPv6 connectivity, so there is nothing to check over.

That is why there is no setting for it, and no option to send checks through an outside service instead. IPv6 will be added when GitHub's runners support it for everyone.

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

Before this step, the workflow has to check out two things: your default branch, and the generated `velvet-data` branch into `.velvet-data`.

The Action then checks the configuration and the data, builds the site, makes the SEO files and the social image, and copies the licence notices into the output directory.

## Licensing and generated-data policy

Velvet's MIT licence covers Velvet: its code, its schemas, and the assets it ships.

It does not cover what your installation produces or displays. Your monitoring records are yours, and any logo, font, or other material you bring keeps whatever rights and notices came with it.

Velvet never deletes a closed GitHub Issue, and never deletes a licence file it finds in your repository.

[LICENSING.md](../LICENSING.md) and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) set out the whole boundary.
