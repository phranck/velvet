# Changelog

## Version 1.0.0

The first public Velvet release. Everything before this was a prototype that
was never published, so this entry describes the product rather than a change
to one.

### What Velvet does

- Direct IPv4 `GET` and `HEAD` checks of every configured endpoint from
  GitHub-hosted runners, every five minutes, with separate response-time
  samples four times a day.
- Incidents and planned maintenance recorded as GitHub Issues, opened after
  confirmed failures and closed after confirmed recoveries.
- Up to 365 days of availability, response-time, incident, and maintenance
  history on a dedicated branch the monitor owns alone.
- A themeable status page published through GitHub Pages, with four system
  themes, service icons, analytics, SEO output, and custom domains.

### Installing

Browser onboarding at [setup.velvet.li](https://setup.velvet.li/onboarding/)
is the only supported way in. It creates the repository, writes the validated
configuration, enables Pages, starts the first monitoring run, and records
which Velvet version the installation runs. Copying the template directly
produces a repository with no version lock, which can never receive a managed
update.

### Updating

Velvet installs new versions for you, from the Configurator, without anyone
opening a repository or acting on a pull request. An update replaces only the
workflow and Issue-template files Velvet owns, plus its own version lock.
`velvet.yml`, the generated data branch, incidents, maintenance records,
repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are
never part of one.

That promise is proven twice: by the service from GitHub's own view of the
change before merging, and by a check running in the installation's repository
against the merge GitHub actually built. A failed check leaves the installation
untouched, and a failed publication restores and republishes the previous
version without rewriting history.

Security releases that need no migration can install themselves. That is on by
default and can be turned off in the Configurator. Everything else waits for
the owner.

### GitHub requirements

Velvet uses the repository-scoped `GITHUB_TOKEN` for monitoring and publishing.
No personal access token is required. A private endpoint may reference one
repository secret by environment-variable name, and only that named secret is
mapped into the monitor workflow.

### Limitations

IPv6 monitoring is deliberately absent until GitHub-hosted runners provide
documented native IPv6 connectivity. A configured service is monitored over
IPv4 only.

### Migrating an Upptime status page

`vum` converts a status page that still runs the older Upptime arrangement. It
is a dry run by default, pins the source revision, validates the complete
result, and reports anything it cannot convert safely. Keep the pre-migration
commit until the native workflows are verified, and preserve any existing
monitoring-data license and attribution.

### Licensing

Velvet is published under the [MIT](https://layered.mit-license.org) license.
Generated monitoring data keeps its own provenance and licensing status, which
[LICENSING.md](LICENSING.md) describes.

## Prototype history

The entries below describe the prototype that preceded this release. They are
kept for anyone migrating a status page that still runs it.

## Version 1.8.0

### New features

- A stable Velvet-owned data layer now separates the public status page from
  its temporary monitoring source.
- Native response-time charts show smooth IPv4 and IPv6 history, unavailable
  periods, protocol-specific styles, and accessible hover details.
- The local theme configurator previews the real status page, imports and saves
  YAML, supports community themes, and keeps opened configuration data local.
- Themes now provide linked named colors, detailed overrides, configurable card
  geometry, chart styling, and complete page backgrounds.

### Improvements

- Status, response history, incidents, and maintenance are published as one
  validated snapshot before the page deploys.
- Fresh monitoring repositories display a safe unknown state until their first
  check completes.
- Incident and maintenance banners refresh while the page is open and retain
  the latest valid state during temporary network or data failures.
- GitHub project Pages paths, navigation, social cards, accessibility, mobile
  protocol layouts, and configurator behavior are more reliable.
- Generated sites now include Velvet's license and third-party notices, while
  monitoring data keeps its separate provenance and licensing status.

### Breaking data-source change and migration

- The browser no longer reads Upptime history or raw GitHub Issues. Existing
  deployments must first install the Velvet data-sync workflow so it publishes
  `status.json`, `response-times.json`, and `incidents.json` under
  `velvet-data/v1`.
- The Pages workflow must build with `phranck/velvet@v1` after a successful
  **Sync Velvet data** run. A push-only deploy can miss snapshot commits created
  by `GITHUB_TOKEN`, so the documented workflow uses `workflow_run`.
- Upptime remains the temporary monitor for v1. Keep its checks and history in
  place; the compatibility adapter, not the browser, reads those inputs.
- Preserve any existing monitoring-data license and attribution when publishing
  the normalized Velvet snapshot.

See the [migration guide](CONFIGURATION.md#migrate-from-an-upptime-status-page)
for the complete workflow and recovery steps.
