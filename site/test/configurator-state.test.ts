import assert from "node:assert/strict";
import test from "node:test";

import {
  exportedSettingsFingerprint,
  isConfiguratorDirty,
} from "../src/configurator/configurator-state.js";
import * as configuratorState from "../src/configurator/configurator-state.js";
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

test("routes platform save shortcuts without hijacking unrelated keys", () => {
  const { saveShortcutAction } = configuratorState as {
    saveShortcutAction?: (event: {
      key: string;
      metaKey: boolean;
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
    }) => "save" | "save-as" | null;
  };

  assert.equal(
    saveShortcutAction?.({
      key: "s",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    }),
    "save",
  );
  assert.equal(
    saveShortcutAction?.({
      key: "S",
      metaKey: false,
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
    }),
    "save-as",
  );
  assert.equal(
    saveShortcutAction?.({
      key: "s",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    }),
    null,
  );
  assert.equal(
    saveShortcutAction?.({
      key: "s",
      metaKey: true,
      ctrlKey: false,
      altKey: true,
      shiftKey: false,
    }),
    null,
  );
});
