# Velvet 2.0.1

Every update now proves itself inside your own repository before it is allowed in.

## What is new

- A new workflow, `Velvet update check`, runs on each update pull request and refuses to pass unless the change touches only files Velvet owns and the version lock matches the update being installed.
- Velvet will not merge an update until that check has succeeded, so a failed check leaves your page exactly as it was.

## Why this matters

Until now the promise that an update never touches your own files rested entirely on the update service. It now also rests on a check that runs on your runner, in your repository, against the merge GitHub actually built. If the two ever disagreed, the update would stop.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
