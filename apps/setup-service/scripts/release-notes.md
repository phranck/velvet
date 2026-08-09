# Velvet 1.5.0

## Added

Your status page now says where it is configured. A line at the foot names `setup.velvet.li/configurator`, worded so a visitor reads past it whilst you recognise the address. Until now the page carried one outbound link, to Velvet's repository, and there was no way back to your own configuration from the page itself.

## Changed

The Powered by Velvet credit is no longer a setting. `showPoweredBy` is gone, and a `velvet.yml` naming it is refused rather than quietly ignored, so if you have that line, remove it. A status page is Velvet's work as much as yours, and whether the product says its own name is not something an installation decides.

Nothing else about your page changes.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
