import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

import { parseChangelog } from "../src/changelog/changelog.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");

test("splits the changelog into one entry per release, in file order", () => {
  const releases = parseChangelog(
    [
      "# Changelog",
      "",
      "Anything written here belongs to no release.",
      "",
      "## Version 2.0.0",
      "",
      "The newer one.",
      "",
      "## Version 1.0.0",
      "",
      "### Installing",
      "",
      "The older one.",
      "",
    ].join("\n"),
  );

  assert.deepEqual(
    releases.map((release) => release.title),
    ["Version 2.0.0", "Version 1.0.0"],
  );
  // The document's own title and its preamble are dropped, because the page
  // supplies a title of its own and would otherwise print two.
  assert.equal(releases[0]!.notes, "The newer one.");
  assert.equal(releases[1]!.notes, "### Installing\n\nThe older one.");
});

test("names no release rather than inventing one for a document without any", () => {
  assert.deepEqual(parseChangelog("# Changelog\n\nNothing published yet.\n"), []);
  assert.deepEqual(parseChangelog(""), []);
});

test("reads the repository's own changelog rather than a copy", async () => {
  const releases = parseChangelog(
    await readFile(resolve(repositoryRoot, "CHANGELOG.md"), "utf8"),
  );

  assert.equal(releases.length > 0, true, "the changelog names no release");
  for (const release of releases) {
    assert.match(
      release.title,
      /^Version \d+\.\d+\.\d+$/u,
      `${release.title} is not a version heading`,
    );
    assert.equal(release.notes.length > 0, true, `${release.title} has no notes`);
    // Every destination the page will render has to be absolute, because the
    // renderer accepts nothing else and silently degrades the rest to text.
    for (const [, destination] of release.notes.matchAll(/\]\(([^)\s]+)\)/gu)) {
      assert.match(
        destination!,
        /^https:\/\//u,
        `${destination} would not survive rendering`,
      );
    }
  }
});
