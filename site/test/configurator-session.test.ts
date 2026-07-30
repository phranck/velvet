import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  CONFIGURATOR_SESSION_STORAGE_KEY,
  loadConfiguratorSession,
  persistConfiguratorSession,
  type ConfiguratorSessionStorage,
} from "../src/configurator/configurator-session.js";
import {
  exportedSettingsFingerprint,
} from "../src/configurator/configurator-state.js";
import { parseConfiguratorYaml } from "../src/configurator/configuration.js";

class MemoryStorage implements ConfiguratorSessionStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test("round-trips an imported working configuration through local storage", () => {
  const parsed = parseConfiguratorYaml(`
owner: example
repo: status
custom-field:
  preserved: true
status-website:
  velvet:
    layout: cards
    theme:
      name: Greenfield
      palette:
        accent: "#27ae60"
`);
  const storage = new MemoryStorage();
  const baseline = exportedSettingsFingerprint(parsed.settings);

  assert.equal(
    persistConfiguratorSession(
      {
        settings: parsed.settings,
        importedDocument: parsed.document,
        importedFilename: "greenfield.yml",
        selectedThemeId: null,
        loadedThemeName: "Greenfield",
        selectedBaseline: baseline,
      },
      storage,
    ),
    true,
  );

  const restored = loadConfiguratorSession(storage);
  assert.ok(restored);
  assert.equal(restored.settings.layout, "cards");
  assert.equal(restored.settings.theme.name, "Greenfield");
  assert.deepEqual(restored.importedDocument?.["custom-field"], {
    preserved: true,
  });
  assert.equal(restored.importedFilename, "greenfield.yml");
  assert.equal(restored.selectedThemeId, null);
  assert.equal(restored.loadedThemeName, "Greenfield");
  assert.equal(restored.selectedBaseline, baseline);
});

test("restores a non-imported theme without turning it into an imported file", () => {
  const parsed = parseConfiguratorYaml(`
status-website:
  velvet:
    theme:
      name: Sunny Spring
`);
  const storage = new MemoryStorage();

  persistConfiguratorSession(
    {
      settings: parsed.settings,
      importedDocument: null,
      importedFilename: ".upptimerc.yml",
      selectedThemeId: "sunny-spring",
      loadedThemeName: "Sunny Spring",
      selectedBaseline: exportedSettingsFingerprint(parsed.settings),
    },
    storage,
  );

  const restored = loadConfiguratorSession(storage);
  assert.ok(restored);
  assert.equal(restored.importedDocument, null);
  assert.equal(restored.selectedThemeId, "sunny-spring");
});

test("persists native service edits through a configurator reload", () => {
  const parsed = parseConfiguratorYaml(`
schemaVersion: 1
repository:
  owner: velvet-user
  name: status
statusPage:
  name: Example Status
services:
  - name: Website
    url: https://example.com
`);
  const storage = new MemoryStorage();
  assert.ok(parsed.settings.services);
  parsed.settings.services[0]!.name = "Public Site";
  parsed.settings.services[0]!.method = "HEAD";
  parsed.settings.services[0]!.advanced = true;

  assert.equal(
    persistConfiguratorSession(
      {
        settings: parsed.settings,
        importedDocument: parsed.document,
        importedFilename: "velvet.yml",
        selectedThemeId: null,
        loadedThemeName: "Velvet Default",
        selectedBaseline: exportedSettingsFingerprint(parsed.settings),
      },
      storage,
    ),
    true,
  );

  const restored = loadConfiguratorSession(storage);
  assert.ok(restored?.settings.services);
  assert.equal(restored.settings.services[0]!.name, "Public Site");
  assert.equal(restored.settings.services[0]!.method, "HEAD");
});

test("keeps the last valid session while a service edit is incomplete", () => {
  const parsed = parseConfiguratorYaml("");
  const storage = new MemoryStorage();
  const session = {
    settings: parsed.settings,
    importedDocument: null,
    importedFilename: "velvet.yml",
    selectedThemeId: "velvet-default",
    loadedThemeName: "Velvet Default",
    selectedBaseline: exportedSettingsFingerprint(parsed.settings),
  };
  assert.equal(persistConfiguratorSession(session, storage), true);
  const previous = storage.getItem(CONFIGURATOR_SESSION_STORAGE_KEY);
  assert.ok(parsed.settings.services);
  parsed.settings.services[0]!.url = "";

  assert.equal(persistConfiguratorSession(session, storage), false);
  assert.equal(storage.getItem(CONFIGURATOR_SESSION_STORAGE_KEY), previous);
});

test("discards an invalid stored session without affecting other local data", () => {
  const storage = new MemoryStorage();
  storage.setItem(CONFIGURATOR_SESSION_STORAGE_KEY, "not json");
  storage.setItem("unrelated", "keep me");

  assert.equal(loadConfiguratorSession(storage), null);
  assert.equal(storage.getItem(CONFIGURATOR_SESSION_STORAGE_KEY), null);
  assert.equal(storage.getItem("unrelated"), "keep me");
});
