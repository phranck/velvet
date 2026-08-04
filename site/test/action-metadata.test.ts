import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");

test("status-page action builds exclusively from Velvet v1 data", async () => {
  const source = await readFile(resolve(repositoryRoot, "action.yml"), "utf8");

  assert.match(source, /config:\n[\s\S]*?default: "velvet\.yml"/);
  assert.match(source, /data:\n[\s\S]*?default: "\.velvet-data\/velvet-data\/v1"/);
  assert.match(source, /VELVET_DATA\/status\.json/);
  // The configuration generator is not given the data path. It used to take
  // one, because a foreign format allowed data to live anywhere; Velvet's data
  // lives on the branch the monitor owns, and the generator names it itself.
  assert.doesNotMatch(source, /generate-config\.mjs[^\n]+VELVET_DATA/);
  assert.doesNotMatch(source, /history\/summary\.json|api\.github\.com/);
  assert.doesNotMatch(source, /generate-feed|incidents\.atom/);
  assert.match(source, /uses: oven-sh\/setup-bun@v2/);
  assert.match(source, /bun-version: "1\.3\.14"/);
  assert.match(source, /bun install --cwd "\$VELVET_ROOT" --frozen-lockfile/);
  assert.doesNotMatch(source, /actions\/setup-node|\bnpm\b|\bnpx\b|node_modules\/\.bin\/tsx/);
});

test("status-page action publishes Velvet and third-party license notices", async () => {
  const source = await readFile(resolve(repositoryRoot, "action.yml"), "utf8");

  assert.match(
    source,
    /cp "\$VELVET_ROOT\/LICENSE" "\$VELVET_SITE\/dist\/LICENSE"/,
  );
  assert.match(
    source,
    /cp "\$VELVET_ROOT\/THIRD_PARTY_NOTICES\.md" "\$VELVET_SITE\/dist\/THIRD_PARTY_NOTICES\.md"/,
  );
});

test("hand-wiring examples track the v1 tag rather than a commit", async () => {
  // A commit written into an example goes stale the moment the configuration
  // contract moves, and then fails every run for whoever copied it. That is what
  // happened: both monitor examples sat on 1126eb1f, a revision predating
  // `updates.automaticSecurityUpdates`, which the schema refuses as unknown.
  //
  // The workflows an installation receives are pinned by commit on purpose, so
  // an installation is reproducible, and a guard in the setup service asserts
  // those. These examples are the opposite case: nobody regenerates them, so
  // they follow the tag, which is also what documentation/releasing.md requires of consumer
  // examples.
  const examples = [
    "actions/monitor/examples/velvet-status.yml",
    "actions/monitor/examples/velvet-response-times.yml",
  ];

  let checked = 0;
  for (const path of examples) {
    const source = await readFile(resolve(repositoryRoot, path), "utf8");
    const pins = [...source.matchAll(/uses:\s*(phranck\/velvet(?![-\w])[^@\s]*)@(\S+)/gu)];
    assert.notEqual(pins.length, 0, `${path} uses a Velvet action`);
    for (const [, action, reference] of pins) {
      checked += 1;
      assert.equal(
        reference,
        "v1",
        `${path} pins ${action} at ${reference}; an example tracks the tag`,
      );
    }
  }
  assert.notEqual(checked, 0, "no Velvet references were recognised at all");
});
