import assert from "node:assert/strict";
import test from "node:test";

import {
  exportedSettingsFingerprint,
  isConfiguratorDirty,
  isDistinctThemeName,
  isSaveShortcut,
} from "../src/configurator/configurator-state.js";
import { parseConfiguratorYaml } from "../src/configurator/configuration.js";

test("marks every exported setting change dirty while ignoring preview state", () => {
  const settings = parseConfiguratorYaml("").settings;
  const baseline = exportedSettingsFingerprint(settings);

  assert.equal(isConfiguratorDirty(settings, baseline), false);
  assert.equal(
    isConfiguratorDirty({ ...settings, layout: "cards" }, baseline),
    true,
  );
  assert.equal(
    isConfiguratorDirty(
      {
        ...settings,
        theme: {
          ...settings.theme,
          chart: { ...settings.theme.chart, fill: true },
        },
      },
      baseline,
    ),
    true,
  );
});

test("recognizes platform save shortcuts without hijacking unrelated keys", () => {
  assert.equal(
    isSaveShortcut({ key: "s", metaKey: true, ctrlKey: false, altKey: false }),
    true,
  );
  assert.equal(
    isSaveShortcut({ key: "S", metaKey: false, ctrlKey: true, altKey: false }),
    true,
  );
  assert.equal(
    isSaveShortcut({ key: "s", metaKey: false, ctrlKey: false, altKey: false }),
    false,
  );
  assert.equal(
    isSaveShortcut({ key: "s", metaKey: true, ctrlKey: false, altKey: true }),
    false,
  );
});

test("requires a non-empty theme name distinct from the selected source", () => {
  assert.equal(isDistinctThemeName("Sunny Spring Copy", "Sunny Spring"), true);
  assert.equal(isDistinctThemeName(" sunny spring ", "Sunny Spring"), false);
  assert.equal(isDistinctThemeName("   ", "Sunny Spring"), false);
});
