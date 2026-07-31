# Velvet 2.0.0

Velvet now monitors your services on its own instead of relying on Upptime.

## What is new

- A native monitor checks every configured endpoint over IPv4, publishing one validated snapshot per run to the dedicated `velvet-data` branch.
- Status, response times, incidents, and maintenance are published together, so the public page never shows a half-updated state.
- Browser onboarding creates and configures the whole repository, including GitHub Pages and the first monitoring run.
- Managed updates arrive through the Configurator. Velvet can install a new version for you without you opening the repository or acting on a pull request.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.

## Notes

IPv6 monitoring is deliberately absent until GitHub-hosted runners provide documented native support.
