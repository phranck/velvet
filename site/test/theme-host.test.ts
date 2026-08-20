import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  themeDataFor,
  layoutFor,
  selectTheme,
} from "../src/lib/themes/host.js";
import { THEME_DATA_VERSION } from "../src/lib/themes/data.js";
import { parseThemeManifest, type ThemeManifest } from "../src/lib/themes/manifest.js";
import type { VelvetConfig } from "../src/lib/config.js";
import { velvetUnderground } from "../theme-bundles/fixtures/index.js";

/**
 * The two decisions the host makes before anything is rendered: which theme,
 * and what to do when the answer is nothing.
 */

function manifest(overrides: Partial<ThemeManifest> = {}): ThemeManifest {
  const parsed = parseThemeManifest(
    {
      name: "Proof",
      description: "A theme.",
      version: "1.0.0",
      order: 1,
      state: "offered",
      dataVersion: THEME_DATA_VERSION,
      root: ".proof-page",
      entries: {
        template: "template.ts",
        styles: "theme.css",
        script: "script.ts",
      },
      layouts: ["grouped"],
      readings: "panel",
    },
    "proof",
  );
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return { ...parsed.manifest, ...overrides };
}

test("picks the theme an installation named", () => {
  const chosen = selectTheme("proof", [manifest()]);
  assert.equal(chosen.ok, true);
  if (!chosen.ok) return;
  assert.equal(chosen.manifest.id, "proof");
});

test("an installation naming nothing gets the page Velvet ships", () => {
  for (const name of [undefined, "", "   "]) {
    const chosen = selectTheme(name, [manifest()]);
    assert.equal(chosen.ok, false);
    if (chosen.ok) continue;
    assert.match(chosen.reason, /names no theme/);
  }
});

test("an unknown name says what is installed rather than falling back", () => {
  const chosen = selectTheme("retro-chassis", [
    manifest(),
    manifest({ id: "vector" }),
  ]);
  assert.equal(chosen.ok, false);
  if (chosen.ok) return;
  assert.match(chosen.reason, /no theme called "retro-chassis"/);
  assert.match(chosen.reason, /proof, vector/);
});

test("a theme reading a data version this release cannot serve is refused", () => {
  const chosen = selectTheme("proof", [
    manifest({ dataVersion: THEME_DATA_VERSION + 1 }),
  ]);
  assert.equal(chosen.ok, false);
  if (chosen.ok) return;
  assert.match(chosen.reason, /reads status data version 2/);
  assert.match(chosen.reason, /serves 1/);
});

test("hands the theme the installation as its operator configured it", () => {
  const config = {
    owner: "example",
    repo: "status",
    dataBranch: "velvet-data",
    dataBaseUrl: "./",
    name: "Velvet Underground Inc.",
    logoHeight: 72,
    serial: 42,
    navbar: [{ title: "Website", href: "#" }],
    layout: "grouped",
    defaultRange: "month",
    theme: {},
    icons: { website: "globe" },
  } as unknown as VelvetConfig;

  const data = themeDataFor(
    config,
    {
      status: velvetUnderground.status,
      incidents: velvetUnderground.incidents,
      responseTimes: velvetUnderground.responseTimes,
    },
    "9.9.9",
  );

  assert.equal(data.dataVersion, THEME_DATA_VERSION);
  assert.equal(data.generatedAt, velvetUnderground.status.generatedAt);
  assert.equal(data.site.name, "Velvet Underground Inc.");
  assert.equal(data.site.serial, 42);
  assert.equal(data.site.version, "9.9.9");
  assert.deepEqual(data.site.icons, { website: "globe" });
  // The documents go across unchanged, because a theme reads exactly what the
  // monitor wrote.
  assert.equal(data.status, velvetUnderground.status);
  assert.equal(data.incidents, velvetUnderground.incidents);
  assert.equal(data.responseTimes, velvetUnderground.responseTimes);
});

test("an installation with no serial says so rather than claiming one", () => {
  const config = {
    name: "Example",
    navbar: [],
    layout: "grouped",
    defaultRange: "month",
    icons: {},
  } as unknown as VelvetConfig;
  const data = themeDataFor(config, {
    status: velvetUnderground.status,
    incidents: velvetUnderground.incidents,
    responseTimes: velvetUnderground.responseTimes,
  });
  assert.equal(data.site.serial, null);
});

test("the theme wins over a layout it cannot draw", () => {
  assert.equal(layoutFor(manifest({ layouts: ["grouped"] }), "cards"), "grouped");
  assert.equal(layoutFor(manifest({ layouts: ["grouped", "cards"] }), "cards"), "cards");
  assert.equal(layoutFor(manifest({ layouts: ["cards"] }), "cards"), "cards");
});
