# Release checklist

Velvet states its version once, in the root `package.json`. Everything else is written from it, and `bun run test:version` fails when any place is left behind, so the first step below is what makes the rest of the release consistent rather than something to remember.

## When a release is due

An installation runs Velvet from a tag. It builds its page with `phranck/velvet@<version>` and checks its services with `phranck/velvet/actions/monitor@<version>`. Merging a fix into `main` therefore changes nothing for anybody until that tag moves.

A fix to code an installation runs is finished when it is tagged, not when it is merged. `bun run --filter @velvet/site release-drift` answers whether anything is waiting: it builds the status page, reads back which files went into it, and compares them against the tag. The `Release drift` workflow runs the same check on every push to `main` and once a day, so a release left uncut is loud rather than invisible.

## Prepare

- [ ] Raise the version in the root `package.json`, then run `bun run version:sync`. That writes the workspace manifests and reprints the board backdrop's silkscreen.
- [ ] Write the entry for the new version at the top of `CHANGELOG.md`, and the update notes in `apps/setup-service/scripts/release-notes.md`. Both are checked against the version, because the first is what the GitHub release is published from and the second is what an installation is offered.
- [ ] Head that entry `## Version X.Y.Z (YYYY-MM-DD)`. The date belongs in the heading, because the changelog page reads it from there and prints it beside the version.
- [ ] Cut the release artefact from `apps/setup-service` with `bun run scripts/build-release.ts --type <security|fix|feature> --notes scripts/release-notes.md`, and commit the regenerated `src/velvet-release.generated.ts`. Add `--automatic` only for a migration-free security release, which is the one category eligible for unattended installation.
- [ ] Read back the `minimumInstalledVersion` the artefact recorded. A release that changes no schema inherits the floor its predecessor declared, which has been 1.0.0 throughout, and a release that changes one records its predecessor instead. `--minimum` overrides that and is for repairing an artefact whose floor is wrong, not for cutting an ordinary release.

## Verify

- [ ] Run the repository's tests, type checks, and builds for the release scope.
- [ ] Regenerate `docs/screenshot.png` from the deterministic demo fixture and complete the screenshot smoke assertions.
- [ ] Validate documentation links, YAML examples, Action metadata, the three contract fixture families, and the fresh-template workflow sequence.
- [ ] If package manifests, `bun.lock`, external font or icon URLs, copied source, assets, or generated build contents changed, regenerate the locked dependency-license inventory, inspect the actual `velvet-dist` output, and update `LICENSING.md` and `THIRD_PARTY_NOTICES.md`.
- [ ] Verify the generated site contains `LICENSE` and `THIRD_PARTY_NOTICES.md`.

## Publish

- [ ] Merge the release through a reviewed pull request. Never tag an unreviewed branch commit.
- [ ] Fetch the reviewed `main` commit and create the version tag from that exact commit.
- [ ] Move the supported major Action tag to the same commit and verify both refs resolve identically.
- [ ] Run `bun scripts/check-template-drift.ts`. It builds the contracts of the revision the artefact pins and validates a configuration against them, so passing means an installation receives a Velvet that can read what Velvet writes. It belongs here rather than in Prepare, because the artefact pins the version it was cut as and the step above is what brings that tag into existence.
- [ ] Publish the GitHub release from the matching section of `CHANGELOG.md`, and verify its target matches the reviewed merge commit.
- [ ] Deploy the setup service, so the artefact a new installation receives is the one this release cut.
- [ ] Confirm the deployed service is the one just built, rather than assuming the push landed. `apps/setup-service/src/deployment-fingerprint.generated.ts` holds the fingerprint of the deployed sources, and `https://setup.velvet.li/healthz` returns what is actually running. They have to match, and the previous fingerprint is served for a minute or two after a push.
- [ ] Walk one browser onboarding against the deployed service and confirm the new repository's first run succeeds.
