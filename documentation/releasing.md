# Release checklist

Velvet states its version once, in the root `package.json`. Everything else is
written from it, and `bun run test:version` fails when any place is left
behind, so the first step below is what makes the rest of the release consistent
rather than something to remember.

## Prepare

- [ ] Raise the version in the root `package.json`, then run
  `bun run version:sync`. That writes the workspace manifests and reprints the
  board backdrop's silkscreen.
- [ ] Write the entry for the new version at the top of `CHANGELOG.md`, and the
  update notes in `apps/setup-service/scripts/release-notes.md`. Both are
  checked against the version, because the first is what the GitHub release is
  published from and the second is what the Configurator shows.
- [ ] Move the Velvet pins in `phranck/velvet-template` to a commit whose
  contracts accept what the setup service writes, through that repository's own
  pull request.
- [ ] Cut the release artefact from `apps/setup-service` with
  `bun run scripts/build-release.ts --type <security|fix|feature> --notes scripts/release-notes.md`,
  and commit the regenerated `src/velvet-release.generated.ts`. Add
  `--automatic` only for a migration-free security release, which is the one
  category eligible for unattended installation.
- [ ] Run `bun scripts/check-template-drift.ts`. It judges the template and the
  artefact together, and passing means an installation receives a Velvet that
  can read what Velvet writes whichever of the two it gets its workflows from.

## Verify

- [ ] Run the repository's tests, type checks, and builds for the release scope.
- [ ] Regenerate `docs/screenshot.png` from the deterministic demo fixture and
  complete the screenshot smoke assertions.
- [ ] Validate documentation links, YAML examples, Action metadata, the three
  contract fixture families, and the fresh-template workflow sequence.
- [ ] If package manifests, `bun.lock`, external font or icon URLs, copied
  source, assets, or generated build contents changed, regenerate the locked
  dependency-license inventory, inspect the actual `velvet-dist` output, and
  update `LICENSING.md` and `THIRD_PARTY_NOTICES.md`.
- [ ] Verify the generated site contains `LICENSE` and
  `THIRD_PARTY_NOTICES.md`.

## Publish

- [ ] Merge the release through a reviewed pull request. Never tag an
  unreviewed branch commit.
- [ ] Fetch the reviewed `main` commit and create the version tag from that
  exact commit.
- [ ] Move the supported major Action tag to the same commit and verify both
  refs resolve identically.
- [ ] Publish the GitHub release from the matching section of `CHANGELOG.md`,
  and verify its target matches the reviewed merge commit.
- [ ] Deploy the setup service, so the artefact a new installation receives is
  the one this release cut.
- [ ] Walk one browser onboarding against the deployed service and confirm the
  new repository's first run succeeds.
