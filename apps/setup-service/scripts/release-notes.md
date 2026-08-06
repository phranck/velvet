# Velvet 1.1.3

## Security

A planned-maintenance issue is now honoured only from someone with write access to your repository. On a public status repository anyone can open an issue, and a maintenance window hides incidents while it is open, so this closes a way a stranger could have masked a real outage. Nothing changes for you: your own maintenance issues keep working.

A header secret can no longer name a variable the runner owns, such as `GITHUB_TOKEN`. Name your own repository secret, as before.

## Also

The configuration reference now describes the header posture of the published page and how to harden it behind a proxy if you want to.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
