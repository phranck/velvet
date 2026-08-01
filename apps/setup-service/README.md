# Velvet setup service

The setup service is the short-lived control plane behind browser onboarding.
It authenticates a user through a Velvet GitHub App, creates one repository from
the allowlisted `phranck/velvet-template`, writes `velvet.yml` and the machine
managed `velvet.lock.json`, enables GitHub Pages, and starts
`.github/workflows/velvet.yml`.

The version lock records the release the installation starts on and is produced
by the same generator a managed update uses, so a fresh installation is already
comparable against a newer release. Without it an installation would have no
version to compare and could never be updated. The lock is written without a
blob SHA, so GitHub refuses the write if the file already exists and a retried
setup cannot overwrite a newer lock.

That template-owned workflow performs the first service check, publishes the
initial Velvet data, builds the site, and deploys GitHub Pages in order. The
browser reports those stages separately and does not claim success until the
workflow and Pages deployment are complete.

Generated status pages do not call this service after setup. They keep running
when the service is unavailable or when the GitHub App is later uninstalled.

Managed updates use a separate repository client and token scope inside the
control plane. That client starts from a repository ID, verifies GitHub's
returned repository identity, and exposes no operation for a different owner
or repository. It reads `velvet.yml` and the current managed files only for the
active operation and does not persist their contents. The repository branch,
technical pull request, checks, version lock, and Pages workflow run remain the
durable operation state. The orchestrator can therefore resume after a process
restart without storing user configuration or status data. Only safe reads use
bounded retries; repository mutations are reconciled before another attempt.

An update replaces the complete closed Velvet-owned file set in one commit on
`velvet/update/<version>`, opens a technical pull request, reads its checks,
merges only the expected head commit, and deletes only that deterministic
branch while it still points to the expected commit. Repository tree updates
use the current tree as their base, so every file outside the closed set stays
untouched. Recovery writes the captured previous managed files as a normal new
commit on the default branch with `force: false`; it never rewrites repository
history.

Ownership is proven from GitHub's own view of the change rather than assumed.
Velvet refuses any repository whose default branch is the generated
`velvet-data` history. Immediately before merging, it reads the technical pull
request's changed files, including both sides of a rename, and stops the
operation whilst the installation is still untouched if any path falls outside
the closed Velvet-owned set. A change to `velvet.yml`, `README.md`, `LICENSE`,
or any other user-owned file therefore cannot reach the default branch. The
monitor rewrites `velvet-data` on its own schedule and replaces it with an
unrelated root commit whenever it compacts elder history, so Velvet never
compares that branch's commits. It only confirms that a data branch which
existed before the merge still exists afterwards.

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

What it cannot cover is GitHub itself. Before the first standalone release,
run the same flow against a disposable repository with real App credentials
and confirm the branch, pull request, checks, merge, Pages deployment, and
cleanup behave as the double assumes.

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
| `GITHUB_APP_SLUG` | Public slug from the GitHub App URL |

After changing runtime variables, restart the service so the Bun process reads
the new values.

## Zerops deployment

[`deploy/zerops-import.yaml`](../../deploy/zerops-import.yaml) creates a Bun
service named `setup`, enables a Zerops subdomain, generates the initial session
secret, and fixes horizontal scaling to one container. Import the service, add
the remaining runtime values, and deploy from the repository root:

```sh
zcli push setup --setup setup --workspace-state clean --zerops-yaml-path zerops.yaml
```

The service uses a **Single container** because OAuth state, user authorization,
and installation tokens exist only in bounded memory. A restart invalidates
active onboarding sessions but does not affect repositories or status pages.
Horizontal scaling must remain disabled until sessions move to a shared store.

`zerops.yaml` builds a self-contained Bun bundle plus the onboarding assets,
serves port `3000`, and checks `/healthz`. Keep secrets out of basic
`run.envVariables`; Zerops secret variables can be updated without rebuilding
the application, followed by a service restart.

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
