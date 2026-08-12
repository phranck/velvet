# Velvet 1.0.1

## What this update fixes

A status page is published in the design its configuration names. If your `velvet.yml` names one under `statusPage.design`, this update is what makes it take effect: the check that reads a configuration took it apart field by field and never copied that one field across, so the page Velvet ships was published instead.

The browser setup offers the four designs where it used to offer four colour palettes. Each one is shown with its name, the period it comes from, and a picture of a page published in it.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
