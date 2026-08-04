# Changelog

## Version 1.1.0 (2026-08-04)

The first release anybody can install and have work. Version 1.0.0 shipped a
status page that stayed empty, because the workflows it installed ran a Velvet
from before the configuration it was handed, and refused it. That is fixed, and
the two halves are now compared by a check rather than kept in step by memory.

### A new installation runs on its first try

Every Velvet action an installation receives is pinned to a revision that
understands the configuration the setup service writes. A check compares the
two on every change and once a day, by validating a configuration the service
can produce against the contracts of the pinned revision, so the next time they
part company it is reported here rather than discovered by somebody installing
Velvet.

### Velvet collects nothing about the people who use it

The analytics setting is gone from the configuration, and with it the last way
a status page could load a third-party script. Nothing on velvet.li,
setup.velvet.li, or a published status page reports a visit to anybody.

The configuration refuses fields it does not know, so a `velvet.yml` still
carrying an `analytics` block has to have it removed. No installation created
through browser onboarding has one, because the setting was gone before the
first installation existed.

### An installation can appear in the public list

Browser onboarding asks whether the status page may be listed at
[velvet.li/references](https://velvet.li/references/), and the Configurator can
change that answer later. Nothing is listed without being asked, and a listing
carries the page's name, its address, and nothing else.

### The status page names its installation

Each installation is issued a number when it is created, and keeps it across
managed updates. The page shows it in its footer.

### velvet.li is now the documentation

The configuration reference, the changelog, the theme gallery, and the
references list are published there, and Velvet ships a complete set of man
pages for the command-line configurator.

### Upptime is gone

Velvet no longer imports, converts, or reads anything an Upptime installation
produced. The paths that handled imported data are removed from the monitor.

## Version 1.0.0

The first public Velvet release. Everything before this was a prototype that
was never published, so this entry describes the product rather than a change
to one.

### What Velvet does

- Direct IPv4 `GET` and `HEAD` checks of every configured endpoint from
  GitHub-hosted runners, every five minutes, with separate response-time
  samples four times a day.
- Incidents and planned maintenance recorded as GitHub Issues, opened after
  confirmed failures and closed after confirmed recoveries.
- Up to 365 days of availability, response-time, incident, and maintenance
  history on a dedicated branch the monitor owns alone.
- A themeable status page published through GitHub Pages, with four system
  themes, service icons, SEO output, and custom domains.
- No analytics of any kind. A published status page loads no third-party
  script, the browser setup reports to nobody, and there is no setting that
  would change either.

### Installing

Browser onboarding at [setup.velvet.li](https://setup.velvet.li/onboarding/)
is the only supported way in. It creates the repository, writes the validated
configuration, enables Pages, starts the first monitoring run, and records
which Velvet version the installation runs. Copying the template directly
produces a repository with no version lock, which can never receive a managed
update.

### Updating

Velvet installs new versions for you, from the Configurator, without anyone
opening a repository or acting on a pull request. An update replaces only the
workflow and Issue-template files Velvet owns, plus its own version lock.
`velvet.yml`, the generated data branch, incidents, maintenance records,
repository secrets, Pages and domain settings, `README.md`, and `LICENSE` are
never part of one.

That promise is proven twice: by the service from GitHub's own view of the
change before merging, and by a check running in the installation's repository
against the merge GitHub actually built. A failed check leaves the installation
untouched, and a failed publication restores and republishes the previous
version without rewriting history.

Security releases that need no migration can install themselves. That is on by
default and can be turned off in the Configurator. Everything else waits for
the owner.

### GitHub requirements

Velvet uses the repository-scoped `GITHUB_TOKEN` for monitoring and publishing.
No personal access token is required. A private endpoint may reference one
repository secret by environment-variable name, and only that named secret is
mapped into the monitor workflow.

### Limitations

IPv6 monitoring is deliberately absent until GitHub-hosted runners provide
documented native IPv6 connectivity. A configured service is monitored over
IPv4 only.

### Licensing

Velvet is published under the [MIT](https://layered.mit-license.org) license.
Generated monitoring data keeps its own provenance and licensing status, which
[LICENSING.md](LICENSING.md) describes.
