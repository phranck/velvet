# Licensing and provenance

This document explains the licensing boundaries used by Velvet. It is a project
policy and technical inventory, not legal advice. Repository owners remain
responsible for confirming that they have the rights needed for their code,
monitoring data, imported datasets, branding, and externally loaded assets.

## Velvet code

Velvet-authored source code, documentation, schemas, Actions, and build scripts
are licensed under the repository [MIT license](LICENSE). The copyright and
permission notice in that file must remain with copies or substantial portions
of Velvet.

The MIT license does not automatically relicense third-party software, assets,
monitoring records, database structure, database rights, trademarks, or personal
data. Those materials retain their applicable terms.

## Generated monitoring data

Velvet does not claim ownership of monitoring data generated in a consumer
repository and does not impose a data license on `velvet-data/v1` documents.
The contract validates structure and semantics only. It intentionally has no
field that changes ownership or licensing.

The repository owner may publish original monitoring data under a separate data
license, leave it unlicensed, or keep it private, subject to applicable law and
any upstream rights. If a data license is chosen, record it next to the data,
for example in `velvet-data/LICENSE`, and describe whether it covers the
database, individual contents, or both.

The generated static site combines Velvet code with the consumer's data.
Velvet's code remains MIT-licensed, while the data keeps its separate status.
The generated `LICENSE` and `THIRD_PARTY_NOTICES.md` files cover Velvet and its
distributed third-party components, not the consumer dataset.

## Imported data and Upptime migration

Conversion changes a data format; it does not erase source provenance or grant
new rights. Before importing data:

1. Inspect the source repository's README, data-directory license files,
   attribution, terms of use, and privacy constraints.
2. Keep applicable notices with the original data and place any required notice
   next to the normalized `velvet-data/v1` documents.
3. Do not delete source notices when old Upptime files or workflows are removed.
4. Record the source, import date, and transformations when provenance is not
   already evident from Git history.

The upstream Upptime repository currently licenses its code under MIT and labels
the data in `history` as
[ODbL-1.0](https://github.com/upptime/upptime/blob/89365e67b44f101e9f1875aeb27bb0e2893e4ad5/history/LICENSE).
Consumer repositories can change or supplement those defaults, so the notices
in the repository being migrated are authoritative.

For ODbL material, preserve the license URI and database-right notices and check
the attribution, share-alike, and source-access conditions before public use.
The [ODbL-1.0 text](https://opendatacommons.org/licenses/odbl/1-0/)
distinguishes the database from its individual contents and explicitly covers
database rights. Do not describe an ODbL-derived database as MIT-licensed merely
because Velvet's converter is MIT-licensed.

## Upptime compatibility implementation

`@velvet/upptime-adapter` is an original Velvet implementation based on public
input formats and documented behavior. It does not copy or execute Upptime
implementation code. Upptime names identify compatibility and provenance; they
do not make the adapter an Upptime distribution.

If future work copies or adapts third-party source, the change must first verify
license compatibility, retain all required copyright and permission notices,
identify the reused files in `THIRD_PARTY_NOTICES.md`, and update this statement.

## Bundled and externally loaded third-party materials

The generated browser JavaScript includes Svelte runtime code, the `esm-env`
environment helper, and TypeBox validation code. Generated social images can
embed Phosphor SVG data. The page also loads Phosphor Web, Inter, and JetBrains
Mono from external providers. Versions, license identifiers, use, and required
notices are recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The GitHub Action copies both Velvet's `LICENSE` and
`THIRD_PARTY_NOTICES.md` into every generated site output. Build-only tools such
as Vite, TypeScript, js-yaml, and resvg run on the Action or development runner
but are not copied into `velvet-dist`; their package license files remain in the
installed dependency tree.

## Release rule

Every release follows the licensing step in [RELEASING.md](RELEASING.md). A
change to package manifests, `package-lock.json`, external asset URLs, copied
source, or generated build contents requires a fresh inventory and notice
review before release.
