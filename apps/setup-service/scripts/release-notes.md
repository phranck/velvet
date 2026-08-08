# Velvet 1.4.1

## Fixed

The installation serial on your status page reads `Serial #00001` again, with its label, and is dimmed to the same degree as the version number in the opposite corner.

It arrived in 1.4.0 as a bare figure in an inverted box, which drew more attention than the services the page is about. The two corner stamps now read as a pair.

Installing an update from the Configurator says that it is doing so. The button turns and reads "Installing…" from the moment it is pressed, and the section explains what is happening. Until now nothing on screen changed during the slowest part of the operation, so there was no way to tell whether the update had started at all.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
