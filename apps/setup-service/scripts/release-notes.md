# Velvet 1.2.2

## Fixed

Opening and closing a service is smooth again, and the page moves as one piece.

The panel now grows and shrinks on its own, so the services below it, the card around them, and the notice underneath travel with it instead of jumping straight to their new place. Safari stuttered noticeably here, and it no longer does: frames dropped during an expand-all fell from 61 to 21 over the same test.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
