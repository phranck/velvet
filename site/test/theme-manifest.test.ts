import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  THEME_DATA_VERSION,
  servesDataVersion,
} from "../src/lib/themes/data.js";
import { parseThemeManifest } from "../src/lib/themes/manifest.js";

/**
 * The manifest is the only thing the host reads before it loads a theme, so
 * everything a host needs to decide has to be in it and has to be checkable.
 *
 * Two facts were previously read out of the computed style: which layouts a
 * theme offers, and whether a reading goes into a panel or an overlay. Both are
 * fields here, and the tests below are what keep them from drifting back into a
 * stylesheet.
 *
 * The other half is the features, which nothing else describes. A configurator
 * draws a control from what a feature says about itself, so a feature that
 * cannot say what it takes is a control that cannot be drawn.
 */

/** A manifest with nothing wrong with it, which each test then spoils. */
function valid(): Record<string, unknown> {
  return {
    name: "Proof",
    description: "A theme that proves the format.",
    version: "1.0.0",
    order: 1,
    state: "offered",
    dataVersion: THEME_DATA_VERSION,
    entries: {
      template: "template.ts",
      styles: "theme.css",
      script: "script.ts",
    },
    layouts: ["grouped"],
    readings: "panel",
  };
}

test("accepts a complete manifest and keeps every field", () => {
  const result = parseThemeManifest(valid(), "proof");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manifest.id, "proof");
  assert.equal(result.manifest.order, 1);
  assert.equal(result.manifest.state, "offered");
  assert.deepEqual(result.manifest.layouts, ["grouped"]);
  assert.equal(result.manifest.readings, "panel");
  assert.equal(result.manifest.entries.styles, "theme.css");
  assert.deepEqual(result.manifest.features, []);
});

test("takes its identifier from the directory rather than from a field", () => {
  const named = valid();
  named.id = "somebody-else";
  const result = parseThemeManifest(named, "proof");
  assert.equal(result.ok, false, "a manifest may not name itself");
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /does not define "id"/);

  const shouted = parseThemeManifest(valid(), "Proof");
  assert.equal(shouted.ok, false, "the directory carries the rules the id had");
});

test("reports every fault at once rather than the first", () => {
  const result = parseThemeManifest(
    {
      name: "",
      description: "A theme.",
      version: "1.0",
      order: 0,
      state: "retired",
      dataVersion: 99,
      entries: { template: "template.ts", styles: "theme.css" },
      layouts: [],
      readings: "somewhere",
    },
    "proof",
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  const joined = result.errors.join("\n");
  assert.match(joined, /name must be a non-empty string/);
  assert.match(joined, /version must be major\.minor\.patch/);
  assert.match(joined, /order must be a whole number/);
  assert.match(joined, /state must be offered or withdrawn/);
  assert.match(joined, /dataVersion 99 is not served/);
  assert.match(joined, /entries\.script/);
  assert.match(joined, /layouts must list at least one/);
  assert.match(joined, /readings must be panel or overlay/);
});

test("refuses a key the format does not define, wherever it stands", () => {
  const stray = valid();
  stray.colour = "#6366f1";
  assert.equal(parseThemeManifest(stray, "proof").ok, false);

  const strayEntry = valid();
  (strayEntry.entries as Record<string, unknown>).styles2 = "extra.css";
  assert.equal(parseThemeManifest(strayEntry, "proof").ok, false);

  const strayFeature = valid();
  strayFeature.features = {
    accent: { type: "colour", label: "Accent", default: "#6366f1", step: 2 },
  };
  const result = parseThemeManifest(strayFeature, "proof");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join("\n"), /features\.accent does not define "step"/);
});

test("refuses an entry that points outside the theme", () => {
  for (const path of ["../velvet/template.ts", "/template.ts", "https://x/y.ts"]) {
    const manifest = valid();
    (manifest.entries as Record<string, unknown>).template = path;
    const result = parseThemeManifest(manifest, "proof");
    assert.equal(result.ok, false, `${path} should be refused`);
  }
});

test("refuses a data version the host does not serve", () => {
  const manifest = valid();
  manifest.dataVersion = THEME_DATA_VERSION + 1;
  const result = parseThemeManifest(manifest, "proof");
  assert.equal(result.ok, false);
  assert.equal(servesDataVersion(THEME_DATA_VERSION + 1), false);
  assert.equal(servesDataVersion(THEME_DATA_VERSION), true);
});

test("keeps all four kinds of feature, in the order they are declared", () => {
  const manifest = valid();
  manifest.features = {
    accent: { type: "colour", label: "Accent", default: "#6366F1" },
    chartWash: { type: "switch", label: "Wash under the curve", default: true },
    corners: {
      type: "choice",
      label: "Corners",
      default: "rounded",
      choices: ["rounded", "square"],
    },
    gridLines: {
      type: "number",
      label: "Grid lines",
      default: 3,
      minimum: 1,
      maximum: 6,
    },
  };
  const result = parseThemeManifest(manifest, "proof");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.manifest.features.map((feature) => feature.key),
    ["accent", "chartWash", "corners", "gridLines"],
  );
  assert.deepEqual(result.manifest.features[0], {
    key: "accent",
    type: "colour",
    label: "Accent",
    default: "#6366F1",
  });
  assert.deepEqual(result.manifest.features[3], {
    key: "gridLines",
    type: "number",
    label: "Grid lines",
    default: 3,
    minimum: 1,
    maximum: 6,
  });
});

test("refuses a feature whose value could not be drawn or checked", () => {
  const cases: Array<[string, Record<string, unknown>, RegExp]> = [
    [
      "a colour that is not one",
      { accent: { type: "colour", label: "Accent", default: "indigo" } },
      /must be a colour/,
    ],
    [
      "a switch with a colour for a default",
      { wash: { type: "switch", label: "Wash", default: "#ffffff" } },
      /must be true or false/,
    ],
    [
      "a choice whose default is not among them",
      {
        corners: {
          type: "choice",
          label: "Corners",
          default: "bevelled",
          choices: ["rounded", "square"],
        },
      },
      /must be one of rounded, square/,
    ],
    [
      "a number outside its own range",
      {
        gridLines: {
          type: "number",
          label: "Grid lines",
          default: 9,
          minimum: 1,
          maximum: 6,
        },
      },
      /must lie between 1 and 6/,
    ],
    [
      "a range that is not one",
      {
        gridLines: {
          type: "number",
          label: "Grid lines",
          default: 3,
          minimum: 6,
          maximum: 1,
        },
      },
      /minimum must be below its maximum/,
    ],
    [
      "a kind nothing can draw",
      { mood: { type: "vibe", label: "Mood", default: "warm" } },
      /type must be colour, switch, choice, number/,
    ],
    [
      "a key that reads like a directory rather than a property",
      { "chart-wash": { type: "switch", label: "Wash", default: true } },
      /lower camel case/,
    ],
  ];
  for (const [what, features, expected] of cases) {
    const manifest = valid();
    manifest.features = features;
    const result = parseThemeManifest(manifest, "proof");
    assert.equal(result.ok, false, what);
    if (result.ok) continue;
    assert.match(result.errors.join("\n"), expected, what);
  }
});
