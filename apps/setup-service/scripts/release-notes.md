# Velvet 1.0.0

Velvet monitors your services from GitHub Actions and publishes a status page through GitHub Pages, without a server or a database.

## What it does

- Direct IPv4 checks of every configured endpoint, every five minutes, with separate response-time samples four times a day.
- Incidents and planned maintenance recorded as GitHub Issues, opened and closed automatically after confirmed failures and recoveries.
- Up to 365 days of availability, response-time, incident, and maintenance history on a dedicated branch the monitor owns alone.
- A themeable status page built from that history, with four system themes and detailed visual configuration.

## Installing and updating

Browser onboarding at [setup.velvet.li](https://setup.velvet.li/onboarding/) creates the repository, writes the configuration, enables Pages, and starts monitoring. It is the only supported way in, and the only one that records which Velvet version an installation runs.

From then on Velvet installs new versions for you. An update replaces only the workflow and Issue-template files Velvet owns, plus its own version lock. Your configuration, history, incidents, secrets, `README.md`, and `LICENSE` are never part of one, and a check running in your own repository refuses any update that would touch them.

## Notes

IPv6 monitoring is deliberately absent until GitHub-hosted runners provide documented native support. A configured service is monitored over IPv4 only.
