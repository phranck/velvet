import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { themeConfigurationFilename } from "../src/configurator/configuration-filename.js";

test("creates a safe YAML filename from the confirmed theme name", () => {
  assert.equal(
    themeConfigurationFilename("Cloudy Autumn Test"),
    "cloudy-autumn-test.yml",
  );
  assert.equal(
    themeConfigurationFilename("  Über den Wolken  "),
    "uber-den-wolken.yml",
  );
  assert.equal(themeConfigurationFilename("..."), "velvet-theme.yml");
});

test("uses the named filename only for the confirmed dialog save", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(
    configurator,
    /downloadConfiguration\(\s*nextSettings,\s*themeConfigurationFilename\(renamedTheme\.name\),?\s*\)/,
  );
  assert.match(
    configurator,
    /importedDocument \? importedFilename : "\.upptimerc\.yml"/,
  );
});
