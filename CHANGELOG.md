# Changelog

## Version 1.1.0

Velvet has a mark of its own, and a finished setup now says so in colour.

### The Velvet mark

The V of the Velvet wordmark, drawn with its two halves in different colours and a status lamp on its right shoulder. Plaster splits the letter into two contours by itself, so the halves are the shapes the typeface already gives, and the lamp is the same mint an installation uses to mark something live.

The browser icon is drawn from that mark and ships at 96, 128, 180, and 256 pixels alongside the vector, so a tab, a home screen, and anything that wants the mark as a picture each get a size that fits. The mark itself is available as `velvet-mark.svg` with a transparent background.

Both the mark and the icon are derived from the wordmark outlines rather than drawn separately, so the letter exists once and everything that shows it follows.

### A finished setup reads as finished

The three outcomes of browser onboarding each carry a tone of their own. A completed setup is drawn in the green its ticks are drawn in, rather than staying a sentence in the grey around it, so the difference between finished, refused, and failed is visible before the words are read.

### Fixed

A logo chosen during setup was lost on the way back from GitHub and the page was published without it. Setup leaves for GitHub and returns to a fresh page, and the draft restored at that point rebuilt every field except the logo. Every installation makes that round trip, so every logo was discarded.

The logo field also accepted files the service could never take. It allowed 350 kB whilst a whole setup request may weigh 256 kB, and a file travels as base64, which is a third larger than the file itself. Both ends now read one figure, derived from the request limit rather than written out twice.

## Version 1.0.0

The first Velvet release. This entry describes the product rather than a change to one.

### What Velvet does

- Direct IPv4 `GET` and `HEAD` checks of every configured endpoint from GitHub-hosted runners, every five minutes, with separate response-time samples four times a day.
- Incidents and planned maintenance recorded as GitHub Issues, opened after confirmed failures and closed after confirmed recoveries.
- Up to 365 days of availability, response-time, incident, and maintenance history on a dedicated branch the monitor owns alone.
- A themeable status page published through GitHub Pages, with four system themes, service icons, SEO output, and custom domains.
- An installation number, issued when a status page is created and shown in its footer.
- No analytics of any kind. A published status page loads no third-party script, the browser setup reports to nobody, and there is no setting that would change either.

### Installing

Browser onboarding at [setup.velvet.li](https://setup.velvet.li/onboarding/) is the only supported way in. It creates the repository, writes the validated configuration, enables Pages, starts the first monitoring run, and records which Velvet version the installation runs. Copying the template directly produces a repository with no version lock, which can never receive a managed update.

Setup asks whether the status page may be named at [velvet.li/references](https://velvet.li/references/). Nothing is listed without being asked, a listing carries the page's name and its address and nothing else, and the Configurator can change that answer at any time.

### Configuring

`velvet.yml` is the configuration, and it is the only format Velvet reads. It is validated before a page is built, so a file Velvet cannot make sense of stops the build rather than producing a page nobody checked.

The [Configurator](https://setup.velvet.li/configurator/) is the supported way to change it. [velvet.li/documentation](https://velvet.li/documentation) describes every field, and Velvet ships man pages for the command-line configurator.

### Updating

Velvet installs new versions for you, from the Configurator, without anyone opening a repository or acting on a pull request. An update replaces only the workflow and Issue-template files Velvet owns, plus its own version lock. `velvet.yml`, the generated data branch, incidents, maintenance records, repository secrets, Pages and domain settings, `README.md`, and `NOTICE` are never part of one.

That promise is proven twice: by the service from GitHub's own view of the change before merging, and by a check running in the installation's repository against the merge GitHub actually built. A failed check leaves the installation untouched, and a failed publication restores and republishes the previous version without rewriting history.

Security releases that need no migration can install themselves. That is on by default and can be turned off in the Configurator. Everything else waits for the owner.

### GitHub requirements

Velvet uses the repository-scoped `GITHUB_TOKEN` for monitoring and publishing. No personal access token is required. A private endpoint may reference one repository secret by environment-variable name, and only that named secret is mapped into the monitor workflow.

### Limitations

IPv6 monitoring is deliberately absent until GitHub-hosted runners provide documented native IPv6 connectivity. A configured service is monitored over IPv4 only.

### Licensing

Velvet is published under the [MIT](https://layered.mit-license.org) license. Generated monitoring data keeps its own provenance and licensing status, which [LICENSING.md](LICENSING.md) describes.
