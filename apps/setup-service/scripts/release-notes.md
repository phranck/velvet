# Velvet 1.0.0

The first Velvet release.

## What you get

A status page published through GitHub Pages, built from `velvet.yml` and from data your own repository collects. Every configured endpoint is checked over IPv4 every five minutes, with separate response-time samples four times a day. Incidents and planned maintenance are GitHub Issues, opened after confirmed failures and closed after confirmed recoveries. Up to 365 days of history live on a branch the monitor owns alone.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.

## What Velvet collects

Nothing. A published status page loads no third-party script, the browser setup reports to nobody, and there is no setting that would change either.
