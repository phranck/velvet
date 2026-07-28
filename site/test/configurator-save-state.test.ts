import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

test("records every successful save as the configurator baseline", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );
  const saveConfiguration = configurator.slice(
    configurator.indexOf("async function saveConfiguration"),
    configurator.indexOf("function resetAppearance"),
  );

  assert.equal(
    [...saveConfiguration.matchAll(/selectedBaseline = exportedSettingsFingerprint\(value\);/g)]
      .length,
    2,
  );
});

test("keeps the active file selected when handle caching is unavailable", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(
    configurator,
    /await writeConfigurationFile\(handle, source\);\s*const handlePersisted = await saveConfigurationFileHandle\(handle\);\s*configurationFileHandle = handle;/,
  );
});

test("reports a download when direct file saves are unavailable", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(configurator, /notice = `Downloaded \$\{filename\}\.`;/);
});

test("attaches the fallback download link before activating it", async () => {
  const configurator = await readFile(
    resolve(import.meta.dirname, "../src/configurator/Configurator.svelte"),
    "utf8",
  );

  assert.match(
    configurator,
    /document\.body\.append\(anchor\);\s*anchor\.click\(\);\s*anchor\.remove\(\);/,
  );
});
