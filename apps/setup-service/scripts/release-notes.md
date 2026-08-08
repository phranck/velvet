# Velvet 1.4.0

## Added

Your status page now arrives readable.

It used to be an empty document that fetched three files and assembled itself in the browser. That is the wrong shape for a page people open when something is already broken, often on the connection that is part of what is broken. The page is now rendered whilst it is built, so it carries its content on arrival, and it stands in your own colours from the first moment rather than after a repaint. The browser picks it up from there and keeps it current exactly as before.

The installation serial has moved to the bottom right corner of the page, opposite the version. Turning the Velvet mark off no longer takes the number with it: the mark is ours, whilst the number belongs to your installation.

## Fixed

An installation that missed a release can be updated again.

Every release from 1.1.1 onwards accepted only the release immediately before it, so a page that skipped one was refused with "Cannot install this version" and had no way forward from the Configurator. A release now carries forward the oldest version its predecessor accepted, and raises that floor only where it genuinely changes a schema. No release ever has.

Setting up a new installation no longer reports a failure that did not happen. GitHub registers a workflow file a few seconds after the push that writes it, and the first attempt to start it could arrive before that and be refused. Velvet now waits and tries again.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
