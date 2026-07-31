# Release checklist

- [ ] Prepare the release on an Issue branch and merge it through a reviewed
  pull request. Never tag an unreviewed branch commit.
- [ ] Run the repository's required tests, type checks, and builds for the
  release scope.
- [ ] Regenerate `docs/screenshot.png` from the deterministic demo fixture and
  complete the screenshot smoke assertions.
- [ ] Validate documentation links, YAML examples, Action metadata, the three
  contract fixture families, and the fresh-template workflow sequence.
- [ ] Scan version and Action references. The release notes must identify the
  intended `v1.8.0` release, consumer examples must use the supported `@v1`
  Action tag, and no stale release pin may remain in published documentation.
- [ ] If package manifests, `bun.lock`, external font or icon URLs,
  copied source, assets, or generated build contents changed, regenerate the
  locked dependency-license inventory, inspect the actual `velvet-dist` output,
  and update `LICENSING.md` and `THIRD_PARTY_NOTICES.md` before release.
- [ ] Verify the generated site contains `LICENSE` and
  `THIRD_PARTY_NOTICES.md`.
- [ ] Preserve applicable source-data notices in migration documentation and
  consumer repositories.
- [ ] After the release pull request is merged, fetch the reviewed `main` commit
  and create `v1.8.0` from that exact commit.
- [ ] Move the compatible major Action tag `v1` to the same commit and verify
  both refs resolve identically.
- [ ] Publish the GitHub release from the Version 1.8.0 section in
  `CHANGELOG.md`. Verify the release target and artifacts match the reviewed
  merge commit.
- [ ] Update the template from its immutable pilot revision to `@v1`, rerun its
  focused pipeline and fresh-install walkthrough, and integrate that change
  through its own pull request.
- [ ] After the template is final, write the release notes to
  `apps/setup-service/scripts/release-notes.md` and regenerate the embedded
  release source with `bun run scripts/build-release.ts --version <semver>
  --type <security|fix|feature> --notes scripts/release-notes.md`. Commit the
  regenerated `src/velvet-release.generated.ts` so installations are updated
  from the reviewed template revision.
