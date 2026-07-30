# Velvet setup service

The setup service is the short-lived control plane behind browser onboarding.
It authenticates a user through a Velvet GitHub App, creates one repository from
the allowlisted `phranck/velvet-template`, writes only `velvet.yml`, enables
GitHub Pages, and starts `.github/workflows/velvet.yml`.

That template-owned workflow performs the first service check, publishes the
initial Velvet data, builds the site, and deploys GitHub Pages in order. The
browser reports those stages separately and does not claim success until the
workflow and Pages deployment are complete.

Generated status pages do not call this service after setup. They keep running
when the service is unavailable or when the GitHub App is later uninstalled.

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
- Pages: Read and write
- Metadata: Read-only, added automatically by GitHub

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
