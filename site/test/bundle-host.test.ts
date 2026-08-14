import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  bundleDataFor,
  layoutFor,
  selectBundle,
} from "../src/lib/bundles/host.js";
import { BUNDLE_DATA_VERSION } from "../src/lib/bundles/data.js";
import { parseBundleManifest, type BundleManifest } from "../src/lib/bundles/manifest.js";
import type { VelvetConfig } from "../src/lib/config.js";
import { velvetUnderground } from "../bundles/fixtures/index.js";

/**
 * The two decisions the host makes before anything is rendered: which design,
 * and what to do when the answer is nothing.
 */

function manifest(overrides: Partial<BundleManifest> = {}): BundleManifest {
  const parsed = parseBundleManifest({
    id: "proof",
    name: "Proof",
    description: "A design.",
    version: "1.0.0",
    dataVersion: BUNDLE_DATA_VERSION,
    entries: {
      template: "template.ts",
      styles: "bundle.css",
      script: "script.ts",
    },
    layouts: ["grouped"],
    readings: "panel",
    preview: "assets/preview.svg",
    plugins: [],
  });
  if (!parsed.ok) throw new Error(parsed.errors.join("; "));
  return { ...parsed.manifest, ...overrides };
}

test("picks the design an installation named", () => {
  const chosen = selectBundle("proof", [manifest()]);
  assert.equal(chosen.ok, true);
  if (!chosen.ok) return;
  assert.equal(chosen.manifest.id, "proof");
});

test("an installation naming nothing gets the page Velvet ships", () => {
  for (const name of [undefined, "", "   "]) {
    const chosen = selectBundle(name, [manifest()]);
    assert.equal(chosen.ok, false);
    if (chosen.ok) continue;
    assert.match(chosen.reason, /names no design/);
  }
});

test("an unknown name says what is installed rather than falling back", () => {
  const chosen = selectBundle("retro-chassis", [
    manifest(),
    manifest({ id: "vector" }),
  ]);
  assert.equal(chosen.ok, false);
  if (chosen.ok) return;
  assert.match(chosen.reason, /no design called "retro-chassis"/);
  assert.match(chosen.reason, /proof, vector/);
});

test("a design reading a data version this release cannot serve is refused", () => {
  const chosen = selectBundle("proof", [
    manifest({ dataVersion: BUNDLE_DATA_VERSION + 1 }),
  ]);
  assert.equal(chosen.ok, false);
  if (chosen.ok) return;
  assert.match(chosen.reason, /reads status data version 2/);
  assert.match(chosen.reason, /serves 1/);
});

test("hands the design the installation as its operator configured it", () => {
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

  const data = bundleDataFor(
    config,
    {
      status: velvetUnderground.status,
      incidents: velvetUnderground.incidents,
      responseTimes: velvetUnderground.responseTimes,
    },
    "9.9.9",
  );

  assert.equal(data.dataVersion, BUNDLE_DATA_VERSION);
  assert.equal(data.generatedAt, velvetUnderground.status.generatedAt);
  assert.equal(data.site.name, "Velvet Underground Inc.");
  assert.equal(data.site.serial, 42);
  assert.equal(data.site.version, "9.9.9");
  assert.deepEqual(data.site.icons, { website: "globe" });
  // The documents go across unchanged, because a design reads exactly what the
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
  const data = bundleDataFor(config, {
    status: velvetUnderground.status,
    incidents: velvetUnderground.incidents,
    responseTimes: velvetUnderground.responseTimes,
  });
  assert.equal(data.site.serial, null);
});

test("the design wins over a layout it cannot draw", () => {
  assert.equal(layoutFor(manifest({ layouts: ["grouped"] }), "cards"), "grouped");
  assert.equal(layoutFor(manifest({ layouts: ["grouped", "cards"] }), "cards"), "cards");
  assert.equal(layoutFor(manifest({ layouts: ["cards"] }), "cards"), "cards");
});
