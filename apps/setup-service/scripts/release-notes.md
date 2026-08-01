# Velvet 1.0.1

Fixes the first monitoring run of a newly created status page.

## What was wrong

The workflows a new installation received pinned a Velvet monitor from before the configuration contract gained its update preference. Onboarding writes that preference, the older monitor rejected it as an unknown field, and the first run failed with an invalid-configuration error. Nothing was published, so the status page stayed empty.

## What changed

The monitor is pinned to the released action, so the version that writes a configuration and the version that reads it are the same one.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
