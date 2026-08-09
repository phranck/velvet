# Changelog

## Version 1.5.1 (2026-08-09)

### Fixed

Every control on every Velvet surface now shows the hand when you point at it. Links already did. What did not were the controls that are neither a link nor a button: the checkboxes and radios in the Configurator's theme panel, the labels that carry them, and the field the onboarding takes your logo through. All of them drew the arrow, which reads as something you cannot press.

A control you genuinely cannot press still draws the arrow. The onboarding's steps stay that way until you reach them.

## Version 1.5.0 (2026-08-09)

### Added

Every status page now says where it is configured. A line at the foot names `setup.velvet.li/configurator`, worded in the third person so a visitor reads past it and the operator recognises the address. Until now a published page carried one outbound link, to Velvet's repository, and somebody who had set their page up weeks earlier had no way back to it from the page itself.

The README a new installation is given says the same thing, and says what the Configurator does with `velvet.yml`. That file is written once, at setup, and no update ever touches it, so it reaches whoever opens the repository and nobody else.

The setup service can forward an alarm to Pushover for an installation, at `POST /api/notify`. Nothing sends one yet, because subscribing is its own piece of work. What is in place is the part that has to be right before anything can: GitHub proves which repository is calling, a grant Velvet signed proves the recipient belongs to that repository, and the two have to name the same repository. So nobody can ever be sent an alarm about a status page that is not theirs.

### Changed

The Powered by Velvet credit is no longer something a configuration can switch off. `showPoweredBy` is gone, and a `velvet.yml` naming it is refused rather than quietly ignored. A status page is Velvet's work as much as its operator's, and whether the product says its own name is not an installation's decision.

## Version 1.4.2 (2026-08-08)

### Changed

Your status page now says "all systems operational" in Velvet's own mark: a tick inside the rounded square the product is built from, drawn in the status colour, in place of the borrowed circle it used until now. The social card your page publishes shows the same mark, so a link preview and the page it points at can no longer disagree about what they are showing.

The gallery at velvet.li/references shows each page on a card carrying that same shape, with the picture reaching the frame and lifting slightly under the pointer.

## Version 1.4.1 (2026-08-08)

### Fixed

The installation serial on your status page reads `Serial #00001` again, with its label, and is dimmed to the same degree as the version number in the opposite corner. It arrived in 1.4.0 as a bare figure in a box that drew more attention than the services the page is about.

Installing an update from the Configurator now says that it is doing so. The button turns and reads "Installing…" from the moment it is pressed, and the section explains what is happening. Until now nothing changed on screen during the slowest part of the operation, so there was no way to tell whether the update had started at all.

## Version 1.4.0 (2026-08-08)

### Added

Your status page now arrives readable. It used to be an empty document that fetched three files and assembled itself in the browser, which is the wrong shape for a page people open when something is already broken, often on the connection that is part of what is broken. The page is now rendered whilst it is built, so it carries its content on arrival. The browser picks it up from there and keeps it current as before. It also stands in your own colours from the first moment rather than after a repaint.

The installation serial now sits in the bottom right corner of the page, opposite the version, instead of under the Velvet mark. Turning the Velvet mark off no longer takes the number with it, the mark being ours whilst the number is your installation's own.

### Fixed

An installation that missed a release can be updated again. Every release from 1.1.1 onwards accepted only the release immediately before it, so a page that skipped one was refused with "Cannot install this version" and had no way forward. A release now carries forward the oldest version its predecessor accepted, and raises that floor only where it genuinely changes a schema.

Setting up a new installation no longer reports a failure that did not happen. GitHub registers a workflow file a few seconds after the push that writes it, and the first attempt to start it could arrive before that and be refused. Velvet now waits and tries again, so the setup finishes the way it always did behind the scenes.

## Version 1.3.1 (2026-08-08)

### Fixed

Signing in with GitHub from the Configurator now comes back to the Configurator. It used to land in the onboarding, at its last step, complaining about entries nobody had made.

## Version 1.3.0 (2026-08-08)

### Changed

Opening and closing a service is smooth, and it stays smooth on the longer ranges. Four things were making your page redraw far more than it needed to, and all four are gone. The backdrop is a layer of its own now, painted once instead of on every frame. Each service's uptime strip is drawn in one piece rather than as one element per day, which is what made the 90-day view heavier than the 30-day one. Every date is formatted through one formatter instead of one per day. And a panel no longer jumps on its last frame.

Measured during an expand-all: the work your browser does per frame fell from 231 per cent of what a 60Hz screen allows to 19 per cent.

The contents of a panel now fade in and out with the movement that reveals them, and the day under your pointer stands a little taller than before.

### Added

Your page states which version of Velvet built it, in its lower left corner.

The availability figure reads "100.00% uptime" rather than the bare number.

## Version 1.2.3 (2026-08-07)

### Fixed

Your status page publishes again. It was being rebuilt every time the monitor finished and then thrown away, because the step that hands the page to GitHub Pages was skipped on every scheduled run. Only a run you started by hand ever published. If your page has looked frozen, this is why, and installing this update ends it.

## Version 1.2.2 (2026-08-07)

### Fixed

Opening a service is smooth again, and the page moves as one. The panel now grows and shrinks on its own, so the services below it, the card around them and the notice underneath travel with it instead of jumping to their new place. Safari stuttered noticeably here; it no longer does.

## Version 1.2.1 (2026-08-07)

### Fixed

Links now show the hand when you point at them. Safari was drawing the ordinary arrow, because no rule said what a link should do and each browser answered that differently. On your status page this is the logo at the top and the Velvet notice at the foot.

## Version 1.2.0 (2026-08-07)

### Changed

Everything set in a monospaced face now uses Fira Code, and Velvet ships the font rather than fetching it. Your status page no longer asks Google Fonts for a monospace at all. If you set `fonts.mono` yourself, that still wins.

The velvet.li pages show the version they were built from, beside the wordmark.

### Fixed

Every release in the changelog carries its date, which the page could always display but no entry had provided.

The release list and the documentation index read better: the date sits on the same line as the version, the whole row answers to the pointer, the panel carries the same shadow as the cards beside it, and its corners are rounded so the entries inside actually keep the curve derived for them.

Two controls now show a pointer when you can press them: the method and value-type menus, and the checkbox asking whether your page may be listed.

## Version 1.1.4 (2026-08-06)

### Security

A forged incident can no longer be published by someone without write access. Velvet marks its own issues with a comment in the body, and that marker was trusted wherever it appeared. On a public repository anyone can open an issue through the maintenance form, which applies its own label, so anyone could write that marker into the body and have an invented outage published on the page as an official incident. Velvet now checks who wrote an issue at the point it reads them, so an issue from anyone without write access is ignored completely: never parsed, never commented on, never published. Your own issues are unaffected.

### Also

The reference now explains why a custom domain should be verified on your GitHub account, and the browser setup says so where you enter one. An unverified domain can be claimed by another account during any gap where no repository holds it, which is what happens if you rebuild an installation.

## Version 1.1.3 (2026-08-06)

### Security

A maintenance window is now honoured only from someone with write access to the repository. A status repository that is public lets anyone open an issue, its maintenance template applies the maintenance label whatever the author's rights, and a maintenance window suppresses incident reporting. Any GitHub user could therefore open a window over every service and hide a real outage. The status workflow now gates a maintenance issue on the author's access before the monitor runs, and the monitor ignores one from an author without write access as a second line.

A header secret can no longer name a variable the runner owns. Names beginning with `GITHUB_`, `ACTIONS_`, or `RUNNER_` are refused, so a check can never be pointed at `GITHUB_TOKEN` to send it to the endpoint it calls. GitHub does not let you create a repository secret under those prefixes, so this refuses nothing you could use.

The configuration reference now records the header posture of the published page. It is served by GitHub Pages, which sets no `Content-Security-Policy` or `X-Frame-Options`, so it can be framed. The note says plainly how a proxy closes that if it matters to you.

## Version 1.1.2 (2026-08-06)

### Fixed

Everything standing above the status cards now takes exactly their width. The page is held to the width set in the Configurator whilst the cards sit a little inside it, so a notice reading that width directly came out wider than the cards it introduced. The inset is now stated once and taken by the cards, by any incident shown above them, and by the first-day notice alike, so all of them end where the cards end at whatever width is configured.

## Version 1.1.1 (2026-08-06)

Three corrections found by walking a fresh installation.

### Fixed

The first-run notice ran wider than the cards beneath it. It read a custom property nothing sets and fell back to a width of its own, so on any page whose theme names another it stood proud of everything under it. It now reads the same width the cards do.

A service checked through a single `url` takes its check's name from itself, so an incident opened for one read `Website / Website is unavailable`. The check is now named only where it says something the service has not.

A status page that agreed to be listed at [velvet.li/references](https://velvet.li/references/) stayed out of the gallery until the hourly pass next ran, which could be an hour after it went live. Setup knows the answer when it records the installation number, and records it there instead.

## Version 1.1.0 (2026-08-06)

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

## Version 1.0.0 (2026-08-04)

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
