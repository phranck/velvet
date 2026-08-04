# Licensing and provenance

This document explains the licensing boundaries used by Velvet. It is a project policy and technical inventory, not legal advice. Repository owners remain responsible for confirming that they have the rights needed for their code, monitoring data, imported datasets, branding, and externally loaded assets.

## Velvet code

Velvet-authored source code, documentation, schemas, Actions, and build scripts are licensed under the repository [MIT license](LICENSE). The copyright and permission notice in that file must remain with copies or substantial portions of Velvet.

The MIT license does not automatically relicense third-party software, assets, monitoring records, database structure, database rights, trademarks, or personal data. Those materials retain their applicable terms.

## Generated monitoring data

Velvet does not claim ownership of monitoring data generated in a consumer repository and does not impose a data license on `velvet-data/v1` documents. The contract validates structure and semantics only. It intentionally has no field that changes ownership or licensing.

The repository owner may publish original monitoring data under a separate data license, leave it unlicensed, or keep it private, subject to applicable law and any upstream rights. If a data license is chosen, record it next to the data, for example in `velvet-data/LICENSE`, and describe whether it covers the database, individual contents, or both.

The generated static site combines Velvet code with the consumer's data. Velvet's code remains MIT-licensed, while the data keeps its separate status. The generated `LICENSE` and `THIRD_PARTY_NOTICES.md` files cover Velvet and its distributed third-party components, not the consumer dataset.

## Bundled and externally loaded third-party materials

The generated browser JavaScript includes Svelte runtime code, the `esm-env` environment helper, and TypeBox validation code. Generated social images can embed Phosphor SVG data. The page also loads Phosphor Web, Inter, and JetBrains Mono from external providers. Versions, license identifiers, use, and required notices are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The GitHub Action copies both Velvet's `LICENSE` and `THIRD_PARTY_NOTICES.md` into every generated site output. Build-only tools such as Vite, TypeScript, js-yaml, and resvg run on the Action or development runner but are not copied into `velvet-dist`; their package license files remain in the installed dependency tree.

## Release rule

Every release follows the licensing step in [documentation/releasing.md](documentation/releasing.md). A change to package manifests, `bun.lock`, external asset URLs, copied source, or generated build contents requires a fresh inventory and notice review before release.
