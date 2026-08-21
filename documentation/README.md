# Documentation

Reference material that a README should point at rather than contain. Each README says what its thing is and what it is for; the detail lives here.

| Document | Covers |
| --- | --- |
| [how-it-works.md](how-it-works.md) | What happens on a run, from a scheduled check to the published page, and what Velvet does when it cannot measure. |
| [configuration.md](configuration.md) | Every `velvet.yml` option: services and checks, the status page, themes, incidents and maintenance, history, managed updates, workflows and permissions, and failure handling. |
| [theme-authoring.md](theme-authoring.md) | Building and changing a theme: the pipeline seam, what a theme may read, and the gates it has to pass. |
| [contracts.md](contracts.md) | The contracts between Velvet's layers, the public document formats, and how the schemas are generated and verified. |
| [setup-service.md](setup-service.md) | Running the control plane: release source, GitHub App registration, runtime configuration, deployment, recovery, and key rotation. |
| [development.md](development.md) | The pinned toolchain, the gates, the committed browser applications, and the theme gates. |
| [releasing.md](releasing.md) | How a Velvet release is cut and what each step guarantees. |
| [man/](man/) | The roff sources for `velvet(7)` and `velvet.yml(5)`, packaged by the website build into the archive velvet.li offers. |

The man pages are the same material read offline. They are written by hand rather than converted, and a test keeps them from drifting: every page has to render without a roff diagnostic, and `velvet.yml(5)` has to name every field [configuration.md](configuration.md) names. Install them with:

```bash
velvet=$(mktemp -d)
curl -sL https://velvet.li/velvet-man-pages.tar.gz | tar -xz -C "$velvet"
"$velvet"/velvet-man-pages/install.sh && rm -rf "$velvet"
```

Two documents stay at the repository root, because that is where both are looked for by convention and by licence obligation: [LICENSING.md](../LICENSING.md) and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
