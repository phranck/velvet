# Setup service

How the control plane behind browser onboarding is built, configured, deployed, and recovered. What it is and what it guarantees is in
[apps/setup-service/README.md](../apps/setup-service/README.md).

## Release source

The version an installation can be updated to is compiled into this service as
`src/velvet-release.generated.ts`. The artefact holds the validated release
manifest together with the exact template file contents it was cut from, so an
update writes reviewed bytes rather than whatever the template repository
happens to serve at the moment it runs. Nothing is fetched at update time, which
removes both a network dependency and the opportunity to influence an update
from outside.

Regenerate it whenever a new Velvet version is published:

```sh
bun run scripts/build-release.ts --version <semver> --type <security|fix|feature> \
  --notes scripts/release-notes.md
```

The tool reads the current head of `phranck/velvet-template`, or an explicit
`--commit`, downloads every Velvet-owned path at that exact revision, and hands
the result to the shared publication rules. It also reads the artefact already
in the repository and uses it as the predecessor, so forward versioning, release
classification, and schema-migration flags are enforced automatically. A
mistyped version or a feature published as a fix cannot be generated at all.

Add `--automatic` only for a migration-free security release, which is the sole
category eligible for unattended installation.

`createEmbeddedReleaseProvider` validates the artefact when it is constructed,
so a broken or tampered artefact fails immediately instead of part-way through
a repository mutation. Until the Configurator update endpoint exists, no runtime
path reaches the provider, so the bundler legitimately omits the artefact from
`dist/`.

## Update failures

Every failure leaving the managed-update boundary carries a stable code, a safe
message chosen from a fixed table by that code, and a unique error ID. The
message is never supplied by the code that failed, so an internal detail, a
configuration value, or an upstream response body cannot reach a user through
it. The original cause is handed to the log sink instead of to the caller.

| Code | Meaning |
| --- | --- |
| `UPDATE_RELEASE_INVALID` | The selected release is not a valid, complete Velvet release |
| `UPDATE_INSTALLATION_INVALID` | The installation's own configuration or version lock cannot be used |
| `UPDATE_REPOSITORY_CHANGED` | The repository moved underneath the operation and must be re-read |
| `UPDATE_GITHUB_UNAVAILABLE` | GitHub was temporarily unavailable, so the same request may be retried |
| `UPDATE_GITHUB_REJECTED` | GitHub refused the request, so retrying it unchanged will fail again |
| `UPDATE_FAILED` | Anything else, deliberately opaque |

These codes are an interface. A consumer may branch on them and a user may quote
them, so a code keeps its meaning once published. An unrecognized error becomes
`UPDATE_FAILED` rather than being guessed into a more specific code, because a
specific code the evidence does not support is worse than an opaque one.

One structured entry is logged per failure, carrying the code, the error ID, the
repository ID, the version, the trigger, and a redacted cause. It contains no
configuration, no repository content, no credentials, and no upstream response
body.

## Verifying the whole flow

`test/update-lifecycle.test.ts` runs onboarding and a managed update against
one repository double, which is what unit tests cannot cover: that a
repository setup produces is one the updater recognises, and that an update
leaves protected content exactly as setup wrote it. It asserts the user's own
files are byte-identical afterwards and that the configured header secret
still reaches the workflow.

What it cannot cover is GitHub itself. `scripts/verify-against-github.ts`
closes that gap by driving the production client against a real repository:

```sh
GITHUB_TOKEN=$(gh auth token) bun run scripts/verify-against-github.ts --owner <login>
```

It creates a disposable repository from the template, runs the update through
branch, pull request, merge, and cleanup, then deletes the repository. Only the
installation-token exchange is substituted, with a token carrying the same
repository and workflow access, so every other request is what an installation
performs.

Running it found three defects no double produced, because a double returns
the shape its author assumed rather than the shape GitHub sends. Add a check
here whenever a new call is introduced.

## GitHub App registration

Register a GitHub App owned by the Velvet maintainer with these settings:

- Homepage URL: `https://velvet.li`.
- Callback URL: `<PUBLIC_ORIGIN>/api/auth/callback`.
- Setup URL: `<PUBLIC_ORIGIN>/api/auth/installed`.
- Expire user authorization tokens: enabled.
- Request user authorization during installation: disabled. Velvet starts the
  OAuth PKCE flow explicitly before installation.
- Device Flow: disabled.
- Webhook: inactive. The setup service subscribes to no events.
- Installation scope: Any account.

GitHub requires an app installation before a GitHub App user token can create a
repository, but a repository-only installation requires that repository to
already exist. First-time setup therefore uses two explicit approvals. The
first temporarily installs Velvet on the selected account, creates only the
requested repository, and immediately removes that installation. The second
installation URL preselects exactly the new repository through its GitHub
repository ID. The setup service will not configure the repository while an
all-repositories installation remains active.

Set only these repository permissions:

- Administration: Read and write
- Contents: Read and write
- Actions: Read and write
- Checks: Read-only
- Pages: Read and write
- Pull requests: Read and write
- Workflows: Read and write
- Metadata: Read-only, added automatically by GitHub

Setup needs Workflows because it tailors the monitor workflows to the
configuration. A check using a header secret only works when the workflow maps
that secret name, and the template ships a commented-out placeholder there. If
an installation was granted access before that permission existed, GitHub
refuses the wider token and setup falls back to writing only the version lock,
so it still completes whilst leaving the workflows untailored. Re-approving the
app restores the full behaviour.

Setup and managed updates mint separate installation tokens. The setup token
keeps only the original setup permissions. The update token is restricted to
one repository ID and requests Actions read and write, Checks read, Contents
write, Pull requests write, and Workflows write. It has no Administration,
Pages, Issues, Secrets, organization, or account permission.

Set **No organization permissions** and **No account permissions**. Do not
subscribe the app to repository, organization, or account events.

## Runtime configuration

The following values belong in the setup service's Zerops secret environment,
never in `zerops.yaml`, browser code, logs, or a generated repository:

| Variable | Value |
| --- | --- |
| `GITHUB_APP_ID` | Numeric App ID from the GitHub App settings |
| `GITHUB_APP_CLIENT_ID` | GitHub App client ID |
| `GITHUB_APP_CLIENT_SECRET` | A current GitHub App client secret |
| `GITHUB_APP_PRIVATE_KEY` | RSA private key; Zerops may store PEM newlines as literal `\n` sequences |
| `SESSION_SECRET` | At least 32 random bytes; the import manifest generates 64 characters |

Set these non-secret runtime values separately:

| Variable | Value |
| --- | --- |
| `PUBLIC_ORIGIN` | Exact HTTPS origin without a trailing path, query, or fragment |
| `WEBSITE_ORIGIN` | Origin of the Velvet website, which may read `/api/references` from its own pages. Optional, and without it that route is readable from this origin alone |
| `GITHUB_APP_SLUG` | Public slug from the GitHub App URL |
| `AUTOMATIC_UPDATE_INTERVAL_MINUTES` | How often eligible security releases are swept for, from 0 through 1440. Defaults to 60, and 0 turns the sweep off |

`WEBSITE_ORIGIN` exists because the references list is served here and rendered
by a page hosted elsewhere. `/api/references` answers a browser on that origin
with `Access-Control-Allow-Origin` and a relaxed resource policy, and every
other route keeps refusing every origin but this one. Leaving it unset is what
an instance without a website of its own wants: the route still answers, and no
page on another host can read it.

The service collects nothing about the people who use it. It serves the
documents it was built with, unchanged, and its Content Security Policy grants
one third-party origin: GitHub Pages, in `connect-src`, because the Configurator
reads the community theme registry Velvet publishes there.

A sweep costs no GitHub request whilst the release the service carries is not a
security release marked for automatic installation, which is the ordinary
state. The interval therefore only decides how quickly one that is marked
reaches installations, not how much work the service does the rest of the time.

After changing runtime variables, restart the service so the Bun process reads
the new values.

## Zerops deployment

[`deploy/zerops-import.yaml`](../deploy/zerops-import.yaml) creates a Bun
service named `setup`, enables a Zerops subdomain, generates the initial session
secret, and fixes horizontal scaling to one container. Import the service, add
the remaining runtime values, and deploy from the repository root:

```sh
zcli push --project-id <project-id> --service-id <service-id> --setup setup \
  --workspace-state clean --zerops-yaml-path zerops.yaml
```

Both identifiers describe your own Zerops project rather than anything about
Velvet, so read them from the account that holds it:

```sh
zcli project list
zcli service list --project-id <project-id>
```

Naming both is required rather than convenient. Given no project, zcli selects
one by itself, and an account commonly holds several, so the push goes wherever
that choice lands. It then fails with `Service [setup] not found` only for as
long as no other project happens to contain a service of that name.

`--zerops-yaml-path` is equally not optional, because this repository's file is
`zerops.yaml` whilst zcli looks for `zerops.yml`. `--workspace-state clean`
pushes `HEAD` and ignores local edits, which is what makes the deployed build
comparable to a commit at all.

The service uses a **Single container** because OAuth state, user authorization,
and installation tokens exist only in bounded memory. A restart invalidates
active onboarding sessions but does not affect repositories or status pages.
Horizontal scaling must remain disabled until sessions move to a shared store.

`zerops.yaml` builds a self-contained Bun bundle plus the onboarding assets,
serves port `3000`, and checks `/healthz`. Keep secrets out of basic
`run.envVariables`; Zerops secret variables can be updated without rebuilding
the application, followed by a service restart.

## Deployment drift

The website publishes itself on every merge to `main` whilst this service is
deployed by hand, so anything the two share can be live in one place and stale
in the other. That is not hypothetical. A prohibited `aria-label` was fixed in a
component both use, the website carried the fix within minutes, and the deployed
onboarding still served the old bundle days later because nothing reported the
difference.

Each build therefore stamps itself with a fingerprint of the sources it was made
from and reports it on `/healthz`. The `Deployment drift` workflow computes the
same fingerprint from `main` and compares the two on every push to `main`, once
a day, and on demand.

It deliberately does not deploy. This service holds live onboarding sessions, so
a failed deploy in the middle of somebody's installation is worse than a stale
one, and the release stays under a person's hand. What the workflow removes is
not knowing. A red run means the deployed service is older than `main`; deploy
it with the command above and the next run passes on its own. An unreachable
service is reported as unknown rather than as drift, because a network failure
says nothing about what is deployed and a check that cries wolf gets ignored.

The fingerprint covers `apps/setup-service/src`, `packages/contracts/src`,
`packages/template-files/src`, and the committed `onboarding/` and
`configurator/` bundles, because the service embeds those at build time. It is a
hash of paths and contents, so it discloses nothing about the sources
themselves. The value lives in `src/deployment-fingerprint.generated.ts`, which
the build writes rather than the repository carrying it, and which is excluded
from the hash it reports. Were it counted, writing it would invalidate the very
value it had just recorded.

## Repository creation

The onboarding decides whether the repository is created public or private, and
sends that answer as `repositoryVisibility`. A request that omits it receives a
public repository, which is what every installation made before the choice
existed received. Publishing GitHub Pages from a private repository requires a
paid GitHub plan, so the onboarding leaves the box unticked and says so beside
it rather than choosing privacy on somebody's behalf. Velvet neither reads nor
maintains the setting afterwards, and it is not part of `velvet.yml`.

## Partial setup recovery

The current browser session records each completed step. On the first setup for
an account, Velvet requests the temporary installation, creates the repository,
removes that installation, and requests access to the new repository alone. A
retry reuses the repository already created by that session, mints a fresh
repository-restricted installation token, and continues from the first
incomplete step. If Velvet is already installed for selected repositories, a
new repository created by the app is added to that selected installation by
GitHub and the temporary step is unnecessary. Velvet mints a token restricted
to that repository, then waits until the token can read the generated
configuration. A bounded GitHub permission propagation delay remains safely
retryable.

The setup configuration commit deliberately contains GitHub's `[skip ci]`
marker. This prevents the template's normal push trigger from racing the
manually dispatched first-deployment workflow. Later configuration commits made
directly by the repository owner continue to trigger normal monitoring.

If the service restarted after repository creation, inspect the named repository
before cleanup. A generated repository containing only the untouched template
can be removed by its owner and setup can be retried with the same name. If
`velvet.yml` was already committed, the owner can run the `Velvet Pages`
workflow manually or retry with a new repository name. The service never
silently overwrites an unrelated existing repository.

Before creating anything, the service checks whether a repository of that name
already exists. When one does, setup stops with `REPOSITORY_EXISTS` and creates
nothing at all, so the name can be changed and the setup retried. Deleting the
repository that is in the way is possible, but only when the request asks for it
explicitly. The onboarding sends that permission after the person installing has
been shown the repository by name and told what deleting it removes, and it
never remembers the answer between attempts.

An organization installation request remains pending until an organization
owner approves it. Velvet reports that state without claiming the app was
installed. GitHub rate limits and failed workflow runs remain retryable and are
reported with safe error IDs.

## Key rotation

### GitHub App private key

1. Generate a new private key in the GitHub App settings.
2. Replace `GITHUB_APP_PRIVATE_KEY` in Zerops and restart the service.
3. Verify `/healthz`, complete one test authorization, and mint an installation
   token through a controlled setup run.
4. Delete the old private key in GitHub only after the new key is verified.

### GitHub App client secret

1. Generate a second client secret in GitHub.
2. Replace `GITHUB_APP_CLIENT_SECRET` in Zerops and restart the service.
3. Complete a new OAuth login.
4. Delete the old client secret after verification.

Changing `SESSION_SECRET` immediately invalidates every active setup session.
Rotate it when session cookies may be exposed, then restart the service and ask
users to begin authorization again.

## Audit and incident recovery

Public errors contain a stable code, safe message, error ID, and request ID.
Structured logs contain route, operation, status, outcome, and a redacted cause;
they never include request bodies, authorization headers, cookies, GitHub token
values, private keys, client secrets, or upstream response bodies.

For a failed setup, correlate the browser's error ID with the structured runtime
log, inspect the GitHub request ID if present, and retry only the recorded
incomplete step. Logging out attempts to revoke the user authorization and
always destroys the local session, even if GitHub is temporarily unavailable.
