import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

/**
 * The designs a page can be published in, as both surfaces offer them.
 *
 * A design ships with Velvet as a bundle, and the one thing that can go wrong
 * is a design without a picture of it.
 */
test("every design that is meant to be chosen is offered with its picture", async () => {
  const { DESIGNS } = await import("../src/lib/designs.js");
  const manifest = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "../src/assets/designs/manifest.json"),
      "utf8",
    ),
  ) as { fixture: string; designs: Record<string, { file: string }> };

  assert.deepEqual(
    [...DESIGNS.map(({ id }) => id)].sort(),
    Object.keys(manifest.designs).sort(),
  );
  assert.equal(DESIGNS.length > 0, true);
  for (const design of DESIGNS) {
    assert.ok(design.picture, `${design.id} has no picture`);
    assert.ok(design.name, `${design.id} has no name`);
    assert.ok(design.description, `${design.id} has no description`);
  }
  // Photographed on a page with nothing wrong on it, because four status pages
  // reporting trouble is the wrong thing to greet anybody with.
  assert.equal(manifest.fixture, "all-well");

  // Read from the source rather than from the resolved URL, because the build
  // rewrites those to hashed names and the assertion would then pass whatever
  // the page ended up showing.
  //
  // Both surfaces are read, because one list is the point of it: a start page
  // advertising four designs whilst the setup offers something else is the
  // thing this prevents.
  for (const surface of [
    "website/Website.svelte",
    "onboarding/Onboarding.svelte",
  ]) {
    const source = await readFile(
      resolve(import.meta.dirname, `../src/${surface}`),
      "utf8",
    );
    assert.match(source, /from "\.\.\/lib\/designs\.js"/u, surface);
  }
});
