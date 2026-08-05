# Velvet status page template

A ready-to-use [Velvet](https://github.com/phranck/velvet) status platform with direct IPv4 monitoring, GitHub Issues for incidents and maintenance, and a GitHub Pages status site. It needs no server or database.

<p align="center">
  <img src="https://raw.githubusercontent.com/phranck/velvet/main/docs/screenshot.png" alt="Velvet status page" width="820">
</p>

## Setup

Everything is configured in the GitHub web interface. No local build is required.

1. **Create your repository.** Click **Use this template**, then **Create a new repository**.

2. **Edit [`velvet.yml`](velvet.yml).** Replace `repository.owner` and `repository.name`, choose the status-page name, and list your services. A standard public website needs only a name and URL. Monitoring needs no repository secret.

3. **Enable GitHub Issues.** Open **Settings**, then **General**, and enable **Issues** under **Features**. Velvet creates confirmed incident Issues automatically and uses Issues for planned maintenance.

4. **Turn on Pages.** Open **Settings**, then **Pages**, and set **Source** to **GitHub Actions**.

The configuration commit starts **Velvet status**. The first successful status run creates the `velvet-data` branch, publishes the initial snapshot, and triggers **Velvet Pages**. The page is then available at `https://<owner>.github.io/<repository>/`.

For a custom domain, set `statusPage.customDomain` in `velvet.yml` before the first deployment.

## What you get

- Direct IPv4 `GET` checks every five minutes. A final HTTP 200 response is healthy by default.
- Response-time samples every six hours.
- Automatic incident creation after confirmed failures and automatic recovery comments and closure.
- Planned maintenance through the Issue Form or the **Maintenance switch** workflow.
- Validated status, response-time, incident, and maintenance data on the dedicated `velvet-data` branch.
- Up to 365 days of retained public and private monitor history.
- A GitHub Pages status site with selectable history ranges, layouts, themes, analytics, SEO settings, and [Phosphor](https://phosphoricons.com) service icons.

A new repository starts without history. This is valid: the first successful status run creates an initial snapshot and begins recording data.

## Configuration

The complete [Velvet configuration reference](https://github.com/phranck/velvet/blob/main/CONFIGURATION.md#github-native-monitor-configuration) covers:

- multiple services and multiple checks per service;
- `GET` and `HEAD` checks, accepted status codes, redirects, and timeouts;
- optional JSON assertions for endpoints that intentionally expose structured health data;
- explicitly mapped header secrets for private endpoints;
- incident thresholds and the 365-day retention limit;
- custom domains, navigation, layouts, themes, analytics, SEO, and icons.

When services change, update the choices in [`.github/ISSUE_TEMPLATE/maintenance.yml`](.github/ISSUE_TEMPLATE/maintenance.yml) so the human-readable names and embedded service IDs still match `velvet.yml`. The **Maintenance switch** workflow accepts the current service IDs directly and needs no YAML changes.

The files consumed by the optional browser setup are deliberately stable:

- user configuration: `velvet.yml`;
- status workflow: `.github/workflows/velvet-status.yml`;
- response workflow: `.github/workflows/velvet-response-times.yml`;
- Pages workflow: `.github/workflows/velvet.yml`;
- maintenance form: `.github/ISSUE_TEMPLATE/maintenance.yml`.

The setup service only edits `velvet.yml` and the maintenance-form choices. It does not generate workflow YAML. Direct template setup remains fully functional when that service is unavailable.

## Security and permissions

All installed Actions are pinned to immutable commits. The monitor uses the repository-scoped `GITHUB_TOKEN`:

- **Velvet status** can write generated data and incident or maintenance Issues.
- **Velvet response times** can write generated data only.
- **Velvet Pages** can read repository data and deploy GitHub Pages.

Public checks need no secret. If a private endpoint requires a header, reference only its environment-variable name in `velvet.yml` and map that one repository secret into both monitor workflows. Never store a secret value in the configuration file.

## Deploy banners from application CI (optional)

The **Deploy announce** workflow can show maintenance while another repository deploys a service. The application repository sends `deploy_start` and `deploy_end` events to this status repository.

1. Create a fine-grained repository token limited to the status repository with **Contents: Read and write**.
2. Store it in the application repository as `STATUS_DISPATCH_TOKEN`.
3. Send the events from the application deploy job:

   ```yaml
   - name: Announce deploy start
     env:
       GH_TOKEN: ${{ secrets.STATUS_DISPATCH_TOKEN }}
     run: >-
       gh api repos/<owner>/<status-repository>/dispatches
       -f event_type=deploy_start
       -F client_payload[service]=Website
       -F client_payload[slug]=website

   - name: Announce deploy end
     if: always()
     env:
       GH_TOKEN: ${{ secrets.STATUS_DISPATCH_TOKEN }}
     run: >-
       gh api repos/<owner>/<status-repository>/dispatches
       -f event_type=deploy_end
       -F client_payload[service]=Website
       -F client_payload[slug]=website
   ```

The `slug` must match a service ID from `velvet.yml`. This token belongs only to the optional application integration. The status repository itself still needs no user-managed token.

## License

This repository has been published under the [MIT](https://layered.mit-license.org) license.
