# Velvet template files

`@velvet/template-files` materializes the closed set of Velvet-owned files in an installed status repository. It combines a validated release manifest, source files verified against the immutable template revision, and one already validated `velvet.yml` configuration.

Static files are copied byte for byte only after their SHA-256 digest matches. Configuration-dependent workflows and the planned-maintenance Issue Form use a versioned deterministic generator. Generators read service identities and header secret names, never secret values. `velvet.lock.json` is derived only from validated release metadata.

Materialization is all or nothing. A missing or changed source, invalid YAML, unknown generator, or invalid manifest returns a stable safe error without any partial output.

Before a manifest is published, `validateReleasePublication` applies the stricter release boundary. A published release must contain the complete closed set of Velvet-owned files, and every source digest must match the exact repository and commit named by the manifest. When a previous release exists, the new version must move forward, remain installable from that predecessor, keep schema versions and migration flags consistent, and follow semantic classification: major or minor changes are features, while patch changes are fixes or security releases.

```ts
import { materializeManagedTemplateFiles } from "@velvet/template-files";

const result = materializeManagedTemplateFiles({
  manifest,
  configuration,
  sources,
});
```

```ts
import { validateReleasePublication } from "@velvet/template-files";

const publication = validateReleasePublication({
  manifest,
  previousManifest,
  source: {
    repository: "phranck/velvet-template",
    commit: templateCommit,
    files: immutableTemplateFiles,
  },
});
```
