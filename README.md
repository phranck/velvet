<div align="center">

# Velvet

**Velvet monitors websites and HTTP endpoints from GitHub Actions and publishes a polished status page through GitHub Pages. No extra server. No database. Just five steps away.**

<a href="https://setup.velvet.li/onboarding/">
  <img src="docs/screenshot.png" alt="Velvet status page" width="930">
</a>

**[Create your status page](https://setup.velvet.li/onboarding/)**

</div>

<br>

Velvet monitors websites and HTTP endpoints from GitHub Actions, records incidents and planned maintenance in GitHub Issues, and publishes a status page through GitHub Pages. A public website needs only a name and a URL.

GitHub is part of the platform here rather than somewhere to host Velvet, which is what makes it GitHub-native. Every installation uses GitHub Actions for scheduling, GitHub Issues for incidents and maintenance, a dedicated Git branch for generated data, and GitHub Pages for the public site.

## What an installation gives you

- Status checks every five minutes, and separate response-time samples four times a day.
- Incidents opened automatically after confirmed failures, and closed again on recovery.
- Planned maintenance that stays visible as a neutral history event.
- Availability, response-time, incident, and maintenance data, kept for up to 365 days.
- Four themes, each shipped whole with the typefaces it uses. Plus service icons, SEO output, custom domains, and selectable history ranges.
- No analytics of any kind. A published page loads no third-party script, the browser setup reports to nobody, and there is no setting that would change either.
- A static page that keeps monitoring and publishing on its own, whether or not the browser setup service is up.

Checks leave GitHub's runners over IPv4. IPv6 follows once those runners offer documented IPv6 connectivity.

## Get started

Open [setup.velvet.li](https://setup.velvet.li/onboarding/). The onboarding asks for the repository and page name, the services, an optional custom domain, and the theme your page is published in. After GitHub approval it creates the repository, enables Pages, starts monitoring, and waits for the first deployment.

This is the only supported way to install Velvet. It is also the only one that writes `velvet.lock.json`, the machine-managed record of which release an installation runs. Without that record Velvet has no version to compare against and can never update the installation.

Everything your page does afterwards is configured in one file, `velvet.yml`, in your own repository.

## Updates

Velvet installs new versions for you. An update replaces only the workflow and Issue-template files Velvet owns, plus its own version lock. Your configuration, your data branch, your incidents, your secrets, and your own files are never part of one, and both the service and a workflow in your repository check that before anything merges.

## Documentation

| Document | Covers |
| --- | --- |
| [How Velvet works](documentation/how-it-works.md) | What happens on a run, from a scheduled check to the published page. |
| [Configuration reference](documentation/configuration.md) | Every `velvet.yml` option, and what each one does. |
| [Theme authoring](documentation/theme-authoring.md) | Building and changing the themes a page is published in. |
| [Contracts](documentation/contracts.md) | The contracts between Velvet's layers and the public document formats. |
| [Setup service](documentation/setup-service.md) | Running the control plane behind browser onboarding. |
| [Development](documentation/development.md) | The pinned toolchain, the gates, and how to work in this repository. |
| [Releasing](documentation/releasing.md) | How a release is cut and what each step guarantees. |

The same reference material is available offline as man pages. `velvet(7)` covers the architecture and `velvet.yml(5)` every configuration option. They install into your own home directory and need no administrator rights:

```bash
velvet=$(mktemp -d)
curl -sL https://velvet.li/velvet-man-pages.tar.gz | tar -xz -C "$velvet"
"$velvet"/velvet-man-pages/install.sh && rm -rf "$velvet"
```

## Releases and licensing

See [CHANGELOG.md](CHANGELOG.md) for release notes and [LICENSING.md](LICENSING.md) for source-data and third-party licence boundaries.

Velvet is published under the [MIT license](https://layered.mit-license.org).
