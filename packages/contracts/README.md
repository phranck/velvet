# Velvet contracts

`@velvet/contracts` is the presentation-independent boundary between Velvet data
producers and consumers. It has no dependency on Svelte, GitHub issue payloads,
monitored endpoint URLs, or a specific monitor implementation.

Everything that reads or writes `velvet.yml` or a public data document goes
through this package, so there is one definition of what is valid rather than
one per consumer. The JSON Schemas it publishes are generated from the same
TypeBox definitions the runtime validates against, which is what stops the two
from drifting.

## Documentation

- [Contracts reference](../../documentation/contracts.md) covers the
  configuration, the managed-update contracts, the package boundaries, the
  version 1 documents, the source of truth, runtime validation, and the
  fixtures.
- [Configuration reference](../../documentation/configuration.md) covers
  `velvet.yml` from a user's point of view.

## Develop

```bash
bun run --filter @velvet/contracts test
bun run --filter @velvet/contracts typecheck
bun run --filter @velvet/contracts build
```
