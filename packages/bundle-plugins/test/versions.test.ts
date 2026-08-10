import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  isPluginName,
  PLUGIN_NAMES,
  PLUGIN_VERSIONS,
  pluginProblem,
} from "../src/plugin.js";
import { VERSION as disclosureVersion } from "../src/disclosure/index.js";
import { VERSION as overlayVersion } from "../src/overlay/index.js";
import { VERSION as chartVersion } from "../src/response-chart/view.js";
import { VERSION as stripVersion } from "../src/uptime-strip/index.js";

/**
 * A plugin's version is what a design was written against, and a design
 * outlives the release that produced it. The number therefore has to be true in
 * two places at once — the plugin's own module and the table the host reads —
 * and this is what stops them disagreeing.
 */

test("every plugin declares the version the table offers", () => {
  assert.equal(disclosureVersion, PLUGIN_VERSIONS.disclosure);
  assert.equal(overlayVersion, PLUGIN_VERSIONS.overlay);
  assert.equal(chartVersion, PLUGIN_VERSIONS["response-chart"]);
  assert.equal(stripVersion, PLUGIN_VERSIONS["uptime-strip"]);
});

test("the table names every plugin and nothing else", () => {
  assert.deepEqual(Object.keys(PLUGIN_VERSIONS).sort(), [...PLUGIN_NAMES].sort());
  for (const name of PLUGIN_NAMES) {
    assert.equal(isPluginName(name), true);
  }
  assert.equal(isPluginName("uptime-bar"), false);
});

test("refuses a plugin that does not exist, and one at another version", () => {
  assert.equal(pluginProblem("uptime-strip", 1), null);
  assert.match(pluginProblem("uptime-bar", 1) ?? "", /no plugin called/);
  assert.match(
    pluginProblem("uptime-strip", 2) ?? "",
    /is at version 1, and this design was written against 2/,
  );
});
