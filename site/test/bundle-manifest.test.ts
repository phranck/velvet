import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  BUNDLE_DATA_VERSION,
  servesDataVersion,
} from "../src/lib/bundles/data.js";
import { parseBundleManifest } from "../src/lib/bundles/manifest.js";

/**
 * The manifest is the only thing the host reads before it loads a design, so
 * everything a host needs to decide has to be in it and has to be checkable.
 *
 * Two facts were previously read out of the computed style: which layouts a
 * design offers, and whether a reading goes into a panel or an overlay. Both are
 * fields here, and the tests below are what keep them from drifting back into a
 * stylesheet.
 */

/** A manifest with nothing wrong with it, which each test then spoils. */
function valid(): Record<string, unknown> {
  return {
    id: "proof",
    name: "Proof",
    description: "A design that proves the format.",
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
  };
}

test("accepts a complete manifest and keeps every field", () => {
  const result = parseBundleManifest(valid());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manifest.id, "proof");
  assert.deepEqual(result.manifest.layouts, ["grouped"]);
  assert.equal(result.manifest.readings, "panel");
  assert.equal(result.manifest.entries.styles, "bundle.css");
});

test("reports every fault at once rather than the first", () => {
  const result = parseBundleManifest({
    id: "Proof",
    name: "",
    description: "A design.",
    version: "1.0",
    dataVersion: 99,
    entries: { template: "template.ts", styles: "bundle.css" },
    layouts: [],
    readings: "somewhere",
    preview: "assets/preview.svg",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  const joined = result.errors.join("\n");
  assert.match(joined, /id must be lowercase/);
  assert.match(joined, /name must be a non-empty string/);
  assert.match(joined, /version must be major\.minor\.patch/);
  assert.match(joined, /dataVersion 99 is not served/);
  assert.match(joined, /entries\.script/);
  assert.match(joined, /layouts must list at least one/);
  assert.match(joined, /readings must be panel or overlay/);
});

test("refuses an entry that points outside the bundle", () => {
  for (const path of ["../velvet/template.ts", "/template.ts", "https://x/y.ts"]) {
    const manifest = valid();
    (manifest.entries as Record<string, unknown>).template = path;
    const result = parseBundleManifest(manifest);
    assert.equal(result.ok, false, `${path} should be refused`);
  }
});

test("refuses a data version the host does not serve", () => {
  const manifest = valid();
  manifest.dataVersion = BUNDLE_DATA_VERSION + 1;
  const result = parseBundleManifest(manifest);
  assert.equal(result.ok, false);
  assert.equal(servesDataVersion(BUNDLE_DATA_VERSION + 1), false);
  assert.equal(servesDataVersion(BUNDLE_DATA_VERSION), true);
});
