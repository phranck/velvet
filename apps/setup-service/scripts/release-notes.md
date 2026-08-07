# Velvet 1.3.0

## Changed

Opening and closing a service on your status page is smooth, and it stays smooth on the longer ranges.

Four things were making the page redraw far more than it needed to, and all four are gone. The backdrop is a layer of its own now, painted once rather than on every frame. Each service's uptime strip is drawn in one piece instead of as one element per day, which is what made the 90-day view heavier than the 30-day one. Every date is formatted through one formatter rather than one per day. And a panel no longer jumps on its last frame.

Measured during an expand-all: the work your browser does per frame fell from 231 per cent of what a 60Hz screen allows to 19 per cent. Above 100 per cent a page cannot keep up, which is what a stutter is.

Nothing looks different, and everything you set in the Configurator still decides what is drawn.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
