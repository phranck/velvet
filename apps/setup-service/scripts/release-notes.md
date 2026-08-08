# Velvet 1.3.1

## Fixed

Signing in with GitHub from the Configurator comes back to the Configurator.

It used to send everybody to the onboarding whichever tool had asked, and the onboarding then resumed at its last step with nothing entered and reported the visitor's own entries as at fault. Neither happens now.

Nothing about your published status page changes with this release. It corrects the tools at velvet.li.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
