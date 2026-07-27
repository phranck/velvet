import assert from "node:assert/strict";
import { test } from "node:test";

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

test("discards an invalid stored session without affecting other local data", () => {
  const storage = new MemoryStorage();
  storage.setItem(CONFIGURATOR_SESSION_STORAGE_KEY, "not json");
  storage.setItem("unrelated", "keep me");

  assert.equal(loadConfiguratorSession(storage), null);
  assert.equal(storage.getItem(CONFIGURATOR_SESSION_STORAGE_KEY), null);
  assert.equal(storage.getItem("unrelated"), "keep me");
});
