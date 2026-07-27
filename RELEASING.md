# Release checklist

- [ ] Run the repository's required tests, type checks, and builds for the
  release scope.
- [ ] If package manifests, `package-lock.json`, external font or icon URLs,
  copied source, assets, or generated build contents changed, regenerate the
  locked dependency-license inventory, inspect the actual `velvet-dist` output,
  and update `LICENSING.md` and `THIRD_PARTY_NOTICES.md` before release.
- [ ] Verify the generated site contains `LICENSE` and
  `THIRD_PARTY_NOTICES.md`.
- [ ] Preserve applicable source-data notices in migration documentation and
  consumer repositories.
