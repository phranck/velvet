# Velvet 1.2.3

## Fixed

Your status page publishes again.

It was being rebuilt every time the monitor finished, and then thrown away. The step that hands the finished page to GitHub Pages was skipped on every scheduled run, so only a run you started by hand ever published anything. A page that has looked frozen whilst its checks kept passing was doing exactly this, and installing this update ends it.

Nothing was lost. Every measurement taken in the meantime is in your `velvet-data` branch, and your page shows all of it as soon as it publishes again.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
