import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "bun:test";

/**
 * Holds the README a new installation is given to what it has to say.
 *
 * The file is written once, at creation, and no update ever touches it again,
 * so anything missing from it is missing for the life of that installation.
 * Nothing else in this repository reads it: the release artefact carries a copy
 * baked at release time, and the tests around provisioning read that copy
 * rather than this source.
 */

const README = new URL("../template/README.md", import.meta.url);

/**
 * The placeholders `renderReadme` in the setup service knows how to fill.
 *
 * A placeholder outside this set survives into somebody's repository as its own
 * literal text, because the renderer replaces these two and nothing else.
 */
const KNOWN_PLACEHOLDERS = ["{{statusPageName}}", "{{statusPageUrl}}"];

test("tells an operator where their page is configured", async () => {
  // A published status page is the only thing most operators still have weeks
  // later, so the README names the file that decides what it shows and where
  // the settings it takes are written down.
  const readme = await readFile(README, "utf8");

  assert.match(readme, /`velvet\.yml`/u);
  assert.match(readme, /documentation\/configuration\.md/u);
});

test("uses only the placeholders the setup service fills", async () => {
  const readme = await readFile(README, "utf8");
  const used = new Set(readme.match(/\{\{[^}]*\}\}/gu) ?? []);

  for (const placeholder of used) {
    assert.ok(
      KNOWN_PLACEHOLDERS.includes(placeholder),
      `${placeholder} is never replaced and would reach a repository as text`,
    );
  }
});
