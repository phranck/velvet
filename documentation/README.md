# Documentation

Reference material that a README should point at rather than contain. Each README says what its thing is and what it is for; the detail lives here.

| Document | Covers |
| --- | --- |
| [configuration.md](configuration.md) | Every `velvet.yml` option: services and checks, the status page, themes, incidents and maintenance, history, managed updates, workflows and permissions, and failure handling. |
| [contracts.md](contracts.md) | The contracts between Velvet's layers, the public document formats, and how the schemas are generated and verified. |
| [setup-service.md](setup-service.md) | Running the control plane: release source, GitHub App registration, runtime configuration, deployment, recovery, and key rotation. |
| [releasing.md](releasing.md) | How a Velvet release is cut and what each step guarantees. |
| [man/](man/) | The roff sources for `velvet(7)`, `velvet-config(1)`, and `velvet.yml(5)`, packaged by the website build into the archive velvet.li offers. |

The man pages are the same material read offline. They are written by hand rather than converted, and a test keeps them from drifting: every page has to render without a roff diagnostic, `velvet-config(1)` has to document every command the `config` script accepts, and `velvet.yml(5)` has to name every field [configuration.md](configuration.md) names. Install them with:

```bash
curl -LO https://velvet.li/velvet-man-pages.tar.gz
tar -xzf velvet-man-pages.tar.gz
./velvet-man-pages/install.sh
```

Two documents stay at the repository root, because that is where both are looked for by convention and by licence obligation: [LICENSING.md](../LICENSING.md) and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
