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

test("theme screenshot manifest matches current system themes and assets", async () => {
  const manifestPath = resolve(
    import.meta.dirname,
    "../src/components/theme-card/assets/manifest.json",
  );
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const result = await validateThemeScreenshotManifest(manifest, {
    assetDirectory: resolve(manifestPath, ".."),
  });

  assert.deepEqual(result, { valid: true });
});
