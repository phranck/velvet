# Velvet template files

`@velvet/template-files` materializes the closed set of Velvet-owned files in
an installed status repository. It combines a validated release manifest,
source files verified against the immutable template revision, and one already
validated `velvet.yml` configuration.

Static files are copied byte for byte only after their SHA-256 digest matches.
Configuration-dependent workflows and the planned-maintenance Issue Form use a
versioned deterministic generator. Generators read service identities and
header secret names, never secret values. `velvet.lock.json` is derived only
from validated release metadata.

Materialization is all or nothing. A missing or changed source, invalid YAML,
unknown generator, or invalid manifest returns a stable safe error without any
partial output.

```ts
import { materializeManagedTemplateFiles } from "@velvet/template-files";

const result = materializeManagedTemplateFiles({
  manifest,
  configuration,
  sources,
});
```
