import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import * as configurationFilename from "../src/configurator/configuration-filename.js";

test("uses velvet.yml as the default configuration filename", () => {
  const { DEFAULT_CONFIGURATION_FILENAME } = configurationFilename as {
    DEFAULT_CONFIGURATION_FILENAME?: string;
  };

  assert.equal(DEFAULT_CONFIGURATION_FILENAME, "velvet.yml");
});

test("keeps the selected configuration file instead of downloading again", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(
    configurator,
    /loadConfigurationFileHandle/,
  );
  assert.match(
    configurator,
    /pickConfigurationFile\(filename\)/,
  );
  assert.match(
    configurator,
    /if \(directFileSavesAvailable\) \{[\s\S]*?writeConfigurationFile\(handle, source\)[\s\S]*?saveConfigurationFileHandle\(handle\)/,
  );
  assert.match(
    configurator,
    /async function requestSaveConfigurationAs\(\): Promise<void> \{[\s\S]*?saveConfiguration\(settings, DEFAULT_CONFIGURATION_FILENAME, true\)/,
  );
});
