import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  INITIAL_TEMPLATE_PATHS,
  MANAGED_TEMPLATE_PATHS,
} from "@velvet/contracts";
import { buildReleaseManifest } from "@velvet/template-files";

import {
  createEmbeddedReleaseProvider,
  embeddedVelvetReleases,
} from "../src/update-releases.js";

const templateCommit = "c".repeat(40);
const pagesWorkflow = ".github/workflows/velvet.yml";

const sources: Record<string, string> = Object.fromEntries(
  MANAGED_TEMPLATE_PATHS.filter((path) => path !== "velvet.lock.json").map(
    (path) => [path, `source for ${path}\n`],
  ),
);

function embeddedRelease(
  overrides: { sources?: Record<string, string>; manifest?: unknown } = {},
): { manifest: unknown; sources: Record<string, string> } {
  const built = buildReleaseManifest({
    version: "2.0.0",
    releaseType: "feature",
    automaticInstallEligible: false,
    compatibility: {
      minimumInstalledVersion: "2.0.0",
      configurationSchemaVersion: 1,
      dataSchemaVersion: 1,
      configurationMigrationRequired: false,
      dataMigrationRequired: false,
    },
    releaseNotes: "# Velvet 2.0.0\n",
    source: {
      repository: "phranck/velvet",
      commit: templateCommit,
      files: sources,
    },
  });
  assert.equal(built.success, true);
  return {
    manifest: overrides.manifest ?? (built.success ? built.data : null),
    sources: overrides.sources ?? sources,
  };
}

test("serves the embedded release and reports it as the latest version", async () => {
  const releases = createEmbeddedReleaseProvider(embeddedRelease());

  assert.equal(releases.latest(), "2.0.0");
  const release = await releases.get("2.0.0");
  assert.equal(release.manifest.version, "2.0.0");
  assert.equal(release.manifest.template.commit, templateCommit);
  assert.deepEqual(
    release.manifest.managedFiles.map((file) => file.path),
    [...MANAGED_TEMPLATE_PATHS],
  );
  assert.equal(release.sources[pagesWorkflow], sources[pagesWorkflow]);
});

test("refuses to serve a version the embedded release does not contain", async () => {
  const releases = createEmbeddedReleaseProvider(embeddedRelease());

  await assert.rejects(
    () => releases.get("2.0.1"),
    /not the embedded Velvet release/u,
  );
});

test("rejects an embedded release whose sources drifted from the manifest", () => {
  assert.throws(
    () =>
      createEmbeddedReleaseProvider(
        embeddedRelease({
          sources: { ...sources, [pagesWorkflow]: "tampered\n" },
        }),
      ),
    /embedded Velvet release is invalid/u,
  );
});

test("rejects an embedded release that is missing a managed template file", () => {
  const incomplete = { ...sources };
  delete incomplete[pagesWorkflow];

  assert.throws(
    () => createEmbeddedReleaseProvider(embeddedRelease({ sources: incomplete })),
    /embedded Velvet release is invalid/u,
  );
});

test("ships a release artefact that passes the publication rules", async () => {
  const releases = embeddedVelvetReleases();

  const release = await releases.get(releases.latest());
  assert.equal(release.manifest.template.repository, "phranck/velvet");
  assert.match(release.manifest.template.commit, /^[a-f0-9]{40}$/u);
  assert.deepEqual(
    release.manifest.managedFiles.map((file) => file.path),
    [...MANAGED_TEMPLATE_PATHS],
  );
  // The managed paths, less the version lock which is generated rather than
  // copied, plus the files a new installation is given once and then owns.
  assert.deepEqual(
    Object.keys(release.sources).sort(),
    [
      ...MANAGED_TEMPLATE_PATHS.filter((path) => path !== "velvet.lock.json"),
      ...INITIAL_TEMPLATE_PATHS,
    ].sort(),
  );
  assert.equal(release.manifest.releaseNotes.length > 0, true);
});

test("rejects an embedded release without a valid manifest", () => {
  assert.throws(
    () => createEmbeddedReleaseProvider(embeddedRelease({ manifest: { schemaVersion: 1 } })),
    /embedded Velvet release is invalid/u,
  );
  assert.throws(
    () => createEmbeddedReleaseProvider(null),
    /embedded Velvet release is invalid/u,
  );
});
