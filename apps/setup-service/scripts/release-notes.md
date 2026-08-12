# Velvet 1.0.0

## What Velvet does

Velvet watches your websites and tells the people who rely on them whether everything is working. Every five minutes GitHub asks each address you listed whether it answers, and four times a day it also notes how long that answer took. Out of this Velvet builds a page anybody can look at.

When an address stops answering, Velvet opens an issue in your repository and marks that service as down. When it answers again, the issue closes and the page says so. Planned work can be announced beforehand and shows up as a notice rather than as a fault.

The page keeps up to a year of history, comes in four designs, and can live on an address of your own. Nothing runs on a server you have to rent, because all of it happens inside GitHub.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
