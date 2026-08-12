import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";

/**
 * Holds every place that states Velvet's version to the one that decides it.
 *
 * The root manifest states the version. `scripts/sync-version.mjs` writes the
 * derived places, and these tests are what makes a place left behind fail the
 * gate rather than ship, since nothing else compares them.
 */

/** Reads a file relative to the repository root. */
async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

/** Reads a JSON file relative to the repository root. */
async function readJson(path) {
  return JSON.parse(await read(path));
}

const root = await readJson("package.json");
const version = root.version;

/** Manifests that carry their own version, which is Velvet's. */
const VERSIONED_MANIFESTS = [
  "packages/contracts/package.json",
  "packages/monitor/package.json",
  "packages/github-incidents/package.json",
  "packages/template-files/package.json",
  "apps/setup-service/package.json",
  "actions/monitor/package.json",
];

/** Manifests that pin a Velvet workspace by version. */
const DEPENDANT_MANIFESTS = [...VERSIONED_MANIFESTS, "site/package.json"];

test("the root manifest states a semantic version", () => {
  assert.match(version, /^\d+\.\d+\.\d+$/u);
});

test("every versioned workspace states it", async () => {
  for (const path of VERSIONED_MANIFESTS) {
    const manifest = await readJson(path);
    assert.equal(
      manifest.version,
      version,
      `${path} states ${manifest.version} rather than ${version}`,
    );
  }
});

test("no workspace repeats it in a dependency range", async () => {
  // Every Velvet package is private and none is published, so a dependency on
  // one is always the copy in this repository. `workspace:*` says that and
  // states no version, so a dependency range is never a place the number has to
  // be kept in step.
  for (const path of DEPENDANT_MANIFESTS) {
    const manifest = await readJson(path);
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (!name.startsWith("@velvet/")) continue;
        assert.equal(
          range,
          "workspace:*",
          `${path} pins ${name} at ${range}, which is a version to keep in step`,
        );
      }
    }
  }
});

test("the release artefact was cut as it", async () => {
  // The artefact is the only one of these an installation ever receives, so it
  // disagreeing means installations are on a different Velvet from the one this
  // repository claims to be. Cut a new one from `apps/setup-service` with
  // `bun run scripts/build-release.ts --type <kind> --notes scripts/release-notes.md`.
  const source = await read("apps/setup-service/src/velvet-release.generated.ts");
  const banner = source.match(/^\/\/ Velvet (\d+\.\d+\.\d+) from /mu)?.[1];
  const manifest = source.match(/"version":\s*"(\d+\.\d+\.\d+)"/u)?.[1];

  assert.equal(banner, version, `the artefact was cut as ${banner}`);
  assert.equal(manifest, version, `the artefact's manifest states ${manifest}`);
});

test("the website states it in the module its header reads", async () => {
  // The bar on every velvet.li page shows this. It is generated rather than
  // read at runtime, because the site is a static build with no repository to
  // read, so nothing but this check would notice it going stale.
  const module = await read("site/src/lib/velvet-version.generated.ts");
  const stated = module.match(/VELVET_VERSION = "(\d+\.\d+\.\d+)"/u)?.[1];

  assert.equal(stated, version, `the website states ${stated}`);
});

test("the release notes are titled with it", async () => {
  // These are what the Configurator shows somebody an update is offered to, and
  // they are compiled into the artefact verbatim. A stale title offers Velvet
  // 1.0.2 to a repository that is about to receive 1.1.0.
  const notes = await read("apps/setup-service/scripts/release-notes.md");
  const title = notes.match(/^# Velvet (\d+\.\d+\.\d+)/mu)?.[1];

  assert.equal(title, version, `the release notes are titled ${title}`);
});

test("the changelog opens with it", async () => {
  // The first release heading in the file is the newest, and it is the text the
  // GitHub release is published from. A heading naming a different version
  // publishes the wrong notes under the right tag.
  const changelog = await read("CHANGELOG.md");
  const heading = changelog.match(/^## Version (\d+\.\d+\.\d+)/mu)?.[1];

  assert.equal(heading, version, `the changelog opens at ${heading}`);
});
