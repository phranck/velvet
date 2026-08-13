import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  exportedSettingsFingerprint,
  isConfiguratorDirty,
  openStateDiffers,
} from "../src/configurator/configurator-state";
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
  assert.equal(
    isConfiguratorDirty(
      { ...settings, icons: { website: "ph-globe" } },
      baseline,
    ),
    true,
  );
  assert.ok(settings.services);
  const renamedServices = structuredClone(settings.services);
  renamedServices[0]!.name = "Public Site";
  assert.equal(
    isConfiguratorDirty({ ...settings, services: renamedServices }, baseline),
    true,
  );
  const disclosureOnly = structuredClone(settings.services);
  disclosureOnly[0]!.advanced = !disclosureOnly[0]!.advanced;
  assert.equal(
    isConfiguratorDirty({ ...settings, services: disclosureOnly }, baseline),
    false,
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

test("reports an open-state map as unchanged whatever order its keys are in", () => {
  // The comparison this replaced was JSON.stringify against JSON.stringify,
  // which preserves key order. Two maps holding the same pairs in a different
  // order came out unequal, and the effect reading it then wrote a value that
  // changed nothing, which on reactive state is itself a change.
  assert.equal(
    openStateDiffers({ api: true, website: false }, { website: false, api: true }),
    false,
  );
});

test("reports an open-state map as changed when a value or a service moves", () => {
  assert.equal(openStateDiffers({ api: true }, { api: false }), true);
  // A service added and one removed keeps the count, so counting alone is not
  // enough and the values have to be read.
  assert.equal(openStateDiffers({ api: true }, { website: true }), true);
  assert.equal(openStateDiffers({ api: true, website: true }, { api: true }), true);
  assert.equal(openStateDiffers({ api: true }, { api: true, website: true }), true);
});
