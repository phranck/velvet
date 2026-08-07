# Velvet 1.2.0

## Changed

Everything on your status page that is set in a monospaced face now uses Fira Code, and Velvet ships the font with your page rather than fetching it. Your page no longer asks Google Fonts for a monospace at all.

If you set `fonts.mono` yourself, that still wins. Only the default changed.

## Also

The velvet.li pages show which version they were built from, every release in the changelog carries its date, and a few controls that could be pressed now show it.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
