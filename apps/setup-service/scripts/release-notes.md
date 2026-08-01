# Velvet 1.0.2

Completes the fix 1.0.1 attempted, so a newly created status page publishes on its first run.

## What was wrong

A new installation receives three workflows, and each pins the Velvet action it uses independently. Version 1.0.1 raised the pin in the two workflows that run on a schedule and left the Pages workflow untouched. That workflow is the only one setup starts, so the very first run still used a Velvet from before the configuration contract gained its update preference. Onboarding writes that preference, the older action rejected it as an unknown field, and the run failed with an invalid-configuration error. Nothing was published, so the status page stayed empty.

## What changed

Every Velvet action the release ships is pinned to the same released revision. That includes the site build inside the Pages workflow, which reads the configuration through the same contract and would have failed at the next step. A guard now scans every pin in the release instead of a maintained list of workflows, because that list is what allowed one workflow to be forgotten.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
