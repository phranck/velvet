# Velvet 1.1.0

The first release that installs and works. It also makes a new installation's first run something a check vouches for rather than something you find out about afterwards.

## What was wrong

The workflows an installation received ran a Velvet from before the configuration that setup writes. That Velvet refuses fields it does not know, so the very first run failed with an invalid-configuration error and the status page stayed empty.

## What changed

Every Velvet action this release ships is pinned to a revision that accepts what the setup service writes, and a check now compares the two rather than leaving it to be remembered. It validates a configuration the service can produce against the contracts of the pinned revision, and it runs on every change and once a day.

Beyond that, this release removes the analytics setting from the configuration, lets an installation appear in the public list at velvet.li/references when its owner says so, shows the installation's number on the status page, and reduces Velvet to one configuration format, `velvet.yml`.

## What stays yours

`velvet.yml`, the complete `velvet-data` branch, your incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are never touched by an update. Velvet only replaces the workflow and issue-template files it owns, plus its own version lock.
