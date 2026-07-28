# Changelog

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

See the [deployment and migration guide](CONFIGURATION.md#compatibility-pipeline-and-velvet-v1-data)
for the complete workflow and recovery steps.
