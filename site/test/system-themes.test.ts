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
 * The two sets of theme pictures, and what each has to be showing.
 *
 * Both come from one run of `theme-screenshots`, photographed from the real
 * Configurator preview, and both show a well page: four status pages reporting
 * trouble is the wrong thing to show anybody, whether they are visiting or
 * installing. They differ in shape, which each manifest records as its own
 * viewport.
 */
const SCREENSHOT_SETS = [
  {
    directory: "../src/components/theme-card/assets",
    health: "operational",
    // Nearly square, because each option in the picker is.
    viewport: { width: 640, height: 480 },
  },
  {
    directory: "../src/website/assets/themes",
    health: "operational",
    // Larger than the picker's, and photographed with the page held in from
    // the edge, because these are cut to a squircle and a squircle pulls in
    // towards its corners.
    viewport: { width: 800, height: 500 },
    contentInset: { inline: 60, block: 38 },
  },
];

test("both sets of theme pictures match the current themes and assets", async () => {
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
    // How far the page was held in from the edge of the picture. The gallery
    // needs it because a squircle cuts into the corners, and a set regenerated
    // without it looks right until somebody reads the ends of a row.
    assert.deepEqual(manifest.contentInset, set.contentInset, set.directory);
  }
});

test("the gallery shows a picture of every theme, and not the picker's", async () => {
  const { GALLERY_THEMES } = await import("../src/website/theme-gallery.js");

  assert.deepEqual(
    GALLERY_THEMES.map(({ id }) => id),
    SYSTEM_THEMES.map(({ id }) => id),
  );
  for (const theme of GALLERY_THEMES) {
    assert.ok(theme.picture, `${theme.id} has no picture`);
  }

  // Read from the source rather than from the resolved URL, because the build
  // rewrites those to hashed names and the assertion would then pass whatever
  // the page ended up showing. What matters is which module the start page
  // asks, since one answers with a degraded page and the other with a well one.
  const startPage = await readFile(
    resolve(import.meta.dirname, "../src/website/Website.svelte"),
    "utf8",
  );
  assert.match(startPage, /from "\.\/theme-gallery\.js"/u);
  assert.doesNotMatch(startPage, /system-themes/u);
});
