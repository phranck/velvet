# How Velvet works

Velvet has no server of its own. An installation is a GitHub repository, and the platform provides every part a status page normally needs a server for. GitHub Actions runs the checks on a schedule, GitHub Issues holds incidents and planned maintenance, a dedicated Git branch stores the measurements, and GitHub Pages serves the finished page.

This document describes what happens on a run. [configuration.md](configuration.md) documents every option named here.

## From a check to a published page

1. `velvet.yml` on your default branch names the repository, the page, and the services to watch.
2. The status workflow runs every five minutes and checks each configured endpoint directly from a GitHub-hosted runner. The response-time workflow runs four times a day and samples how long each endpoint takes to answer.
3. A successful run commits one complete, validated snapshot to the `velvet-data` branch. The monitor never writes to your default branch.
4. The Pages workflow builds the site, the social card, and the SEO files from that snapshot. The page is rendered during the build, so what GitHub Pages serves is readable before any script has run. That matters most on the connection somebody reaches for when something is already broken.
5. In the browser, the page adopts what was rendered and keeps it current. It validates `status.json`, `response-times.json`, and `incidents.json` before showing them. Endpoint URLs and secrets never enter those public documents.

## What one check does

A check sends one request and, where that fails, at most one immediate retry. A single failed measurement is not an outage yet. The page shows the service as degraded whilst Velvet waits for the next run to agree.

Two consecutive failed measurements confirm an outage and open one GitHub Issue for it. Two consecutive successful measurements confirm recovery and close it again. Both counts are settings, `failureThreshold` and `recoveryThreshold`.

Status runs update availability and incidents. Response-time runs only add samples, so they never change a confirmed service state. Planned maintenance is shown as a neutral event and never counts against measured availability.

Checks leave GitHub's runners over IPv4, because those runners offer no documented IPv6 connectivity to check over.

## When a run cannot measure

Velvet separates your endpoint being down from Velvet being unable to measure it. Invalid configuration, an unavailable secret, an unsafe request setup, invalid stored data, and a write conflict on the data branch all stop the run rather than record an outage. The last valid snapshot stays published, and your page goes on showing it.

[configuration.md](configuration.md) covers what each of those failures reports and how to recover from it.

## What Velvet owns

The monitor writes only its own generated files, and only on the `velvet-data` branch. Your `velvet.yml`, your incidents, your repository secrets, and every other file on your default branch stay yours, and a managed update may not touch them either. [configuration.md](configuration.md) lists the exact paths and the rules an update is held to.
