# Velvet 1.1.4

## Security

A forged incident can no longer be published by someone without write access to your repository. On a public status repository anyone can open an issue, and Velvet trusted the marker it writes into an issue body wherever that marker appeared. That let a stranger have an invented outage published on your page as an official incident.

Velvet now checks who wrote an issue at the point it reads them. An issue from anyone without write access is ignored completely: never parsed, never commented on, never published. Your own incidents and maintenance windows are unaffected.

## Also

The reference explains why a custom domain should be verified on your GitHub account, and the browser setup says so where you enter one.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
