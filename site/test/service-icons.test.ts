import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  CURATED_SERVICE_ICONS,
  DEFAULT_SERVICE_ICON,
  iconFor,
  isCuratedServiceIcon,
} from "../src/lib/icons.js";

test("offers one curated and unique Phosphor Duotone icon set", () => {
  assert.ok(CURATED_SERVICE_ICONS.length >= 8);
  assert.equal(
    new Set(CURATED_SERVICE_ICONS.map(({ icon }) => icon)).size,
    CURATED_SERVICE_ICONS.length,
  );
  assert.ok(CURATED_SERVICE_ICONS.every(({ icon }) => /^ph-[a-z0-9-]+$/.test(icon)));
  assert.equal(isCuratedServiceIcon("ph-globe"), true);
  assert.equal(isCuratedServiceIcon("ph-user-supplied"), false);
});

test("keeps automatic service mappings and a neutral fallback", () => {
  assert.equal(iconFor("website"), "ph-globe");
  assert.equal(iconFor("storage"), "ph-hard-drives");
  assert.equal(iconFor("unknown-service"), DEFAULT_SERVICE_ICON);
});

test("ignores unsafe icon overrides at the rendering boundary", () => {
  assert.equal(
    iconFor("website", { website: "ph-not-in-the-curated-set" }),
    "ph-globe",
  );
});
