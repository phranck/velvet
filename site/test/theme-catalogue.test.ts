import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

import { themeCatalogueText } from "../scripts/write-theme-catalogue.js";

/**
 * The catalogue is what every browser surface reads, and it is written by a
 * build step rather than by hand.
 *
 * A generated file that is committed can go stale, and this is what says so.
 * The comparison is text against text: the catalogue as the themes on disk
 * would produce it now, against the copy in the repository. Nothing else can
 * tell, because the themes describe themselves in TOML and no browser reads
 * TOML.
 *
 * It also holds the pairing the file `src/assets/designs/manifest.json` carries,
 * because a theme without a picture cannot be offered and a picture without a
 * theme is a file nobody deletes.
 */

const CATALOGUE = resolve(
  import.meta.dirname,
  "../src/lib/theme-catalogue.generated.json",
);

test("the committed catalogue matches the themes on disk", async () => {
  const written = await readFile(CATALOGUE, "utf8");
  const current = await themeCatalogueText();
  assert.equal(
    written,
    current,
    "run: bun run --cwd site generated:build, then commit the catalogue",
  );
});

test("every theme is offered with a name, a sentence and a picture", async () => {
  const themes = JSON.parse(await readFile(CATALOGUE, "utf8")) as Array<{
    id: string;
    name: string;
    description: string;
    picture: string;
    order: number;
    state: string;
  }>;
  const pictures = JSON.parse(
    await readFile(
      resolve(import.meta.dirname, "../src/assets/designs/manifest.json"),
      "utf8",
    ),
  ) as { fixture: string; designs: Record<string, { file: string }> };

  assert.equal(themes.length > 0, true);
  assert.deepEqual(
    themes.map(({ id }) => id).sort(),
    Object.keys(pictures.designs).sort(),
  );
  for (const theme of themes) {
    assert.ok(theme.name, `${theme.id} has no name`);
    assert.ok(theme.description, `${theme.id} has no description`);
    assert.ok(theme.picture, `${theme.id} has no picture`);
  }

  // Photographed on a page with nothing wrong on it, because four status pages
  // reporting trouble is the wrong thing to greet anybody with.
  assert.equal(pictures.fixture, "all-well");
});

test("no two themes claim the same place in the list", async () => {
  const themes = JSON.parse(await readFile(CATALOGUE, "utf8")) as Array<{
    id: string;
    order: number;
  }>;
  const places = themes.map((theme) => theme.order);
  assert.deepEqual(
    [...new Set(places)].length,
    places.length,
    "two themes claim one place, so the order they are offered in is decided by chance",
  );
  assert.deepEqual([...places].sort((left, right) => left - right), places);
});
