# Velvet setup service

The short-lived control plane behind browser onboarding. It authenticates a user through a Velvet GitHub App, creates one repository from the allowlisted `phranck/velvet-template`, writes `velvet.yml` and the machine-managed `velvet.lock.json`, enables GitHub Pages, and starts the template's own workflow.

The version lock records which release an installation starts on. Without it an installation would have no version to compare against and could never be updated. It is written without a blob SHA, so GitHub refuses the write if the file already exists and a retried setup cannot overwrite a newer lock.

It also serves the configurator, at `/config`. That is a second browser application rather than a second service, and it lives on this origin so it uses the session already established here: the cookie carries a `__Host-` prefix, which binds it to one hostname, so a name of its own would mean a second sign-in. It reads which installations somebody may configure from `/api/installations`, the same route managed updates ask.

The themes it shows are served alongside it, under `/config/themes/<theme>/`, one small site each with its own document, stylesheet, script and faces. The configurator frames that document rather than writing one itself, so a theme's stylesheet stays a linked file and the policy needs no grant for an inline one. Those files are cached but revalidated, because their names carry no content hash and a release changes what is behind them; the application's own assets are hashed and are kept for a year.

Generated status pages do not call this service after setup. They keep running when it is unavailable or when the GitHub App is later uninstalled.

Managed updates run here too. An update replaces the complete closed set of Velvet-owned files in one commit on `velvet/update/<version>`, opens a technical pull request, and merges only the expected head commit. Ownership is proven from GitHub's own view of the change rather than assumed: immediately before merging, Velvet reads the pull request's changed files and stops whilst the installation is untouched if any path falls outside that closed set. A change to `velvet.yml`, `README.md`, or any other user-owned file therefore cannot reach the default branch.

Recovery writes the captured previous files as a normal new commit with `force: false`. It never rewrites repository history.

## Documentation

- [Setup service reference](../../documentation/setup-service.md) covers the release source, update failures, GitHub App registration, runtime configuration, deployment, partial-setup recovery, key rotation, and audit.
- [Configuration reference](../../documentation/configuration.md) covers `velvet.yml` itself.

## Develop

```bash
bun run --filter @velvet/setup-service test
bun run --filter @velvet/setup-service typecheck
bun run --filter @velvet/setup-service build
```
