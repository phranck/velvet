import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";

import { validateVelvetConfiguration } from "@velvet/contracts";
import {
  SYSTEM_THEMES,
  canonicalSystemTheme,
} from "../src/onboarding/system-themes.js";
import { validateThemeScreenshotManifest } from "../src/onboarding/theme-screenshot-manifest.js";

test("offers exactly the four embedded system themes as complete canonical themes", () => {
  assert.deepEqual(
    SYSTEM_THEMES.map(({ name }) => name),
    ["Velvet Default", "Cloudy Autumn", "Sunny Spring", "Violet Velvet"],
  );

  for (const theme of SYSTEM_THEMES) {
    const canonical = canonicalSystemTheme(theme);
    const result = validateVelvetConfiguration({
      schemaVersion: 1,
      repository: { owner: "velvet-user", name: "status" },
      statusPage: { name: "Status", theme: canonical },
      services: [{ name: "Website", url: "https://example.com" }],
    });
    assert.equal(result.success, true, theme.name);
    assert.ok(canonical.palette);
    assert.ok(canonical.grid);
    assert.ok(canonical.chart);
    assert.ok(canonical.background);
    assert.ok(canonical.card);
    assert.ok(canonical.headline);
    assert.ok(canonical.service);
    assert.ok(canonical.text);
  }
});

/**
 * The theme picker's pictures, and what they have to be showing.
 *
 * From `theme-screenshots`, photographed from the real Configurator preview,
 * showing a well page: four status pages reporting trouble is the wrong thing
 * to show somebody installing Velvet.
 */
const SCREENSHOT_SETS = [
  {
    directory: "../src/components/theme-card/assets",
    health: "operational",
    // Nearly square, because each option in the picker is.
    viewport: { width: 640, height: 480 },
  },
];

test("the theme picker's pictures match the current themes and assets", async () => {
  for (const set of SCREENSHOT_SETS) {
    const manifestPath = resolve(
      import.meta.dirname,
      `${set.directory}/manifest.json`,
    );
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const result = await validateThemeScreenshotManifest(manifest, {
      assetDirectory: resolve(manifestPath, ".."),
    });

    assert.deepEqual(result, { valid: true }, set.directory);
    // Which page each set was photographed on. Without this the two could be
    // regenerated from the same state and nobody would see it in the pictures
    // until the start page reported trouble again.
    assert.equal(manifest.health, set.health, set.directory);
    assert.deepEqual(manifest.viewport, set.viewport, set.directory);
  }
});

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
    assert.doesNotMatch(source, /system-themes/u, surface);
  }
});
