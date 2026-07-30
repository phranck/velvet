import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  CONFIGURATOR_SECTION_IDS,
  parseSectionState,
  serializeSectionState,
  setAllSectionState,
} from "../src/configurator/section-state.js";

test("defaults every configurator section to open", () => {
  assert.deepEqual(parseSectionState(null),
    Object.fromEntries(CONFIGURATOR_SECTION_IDS.map((id) => [id, true])),
  );
});

test("restores known collapsed sections and ignores malformed storage", () => {
  const restored = parseSectionState(
    JSON.stringify({ layout: false, chart: false, unknown: false }),
  );

  assert.equal(restored.layout, false);
  assert.equal(restored.chart, false);
  assert.equal(restored.palette, true);
  assert.deepEqual(parseSectionState("not json"), parseSectionState(null));
  assert.deepEqual(
    parseSectionState(JSON.stringify({ layout: "closed" })),
    parseSectionState(null),
  );
});

test("serializes only the stable section identifiers", () => {
  assert.equal(
    serializeSectionState({
      ...parseSectionState(null),
      cards: false,
      ignored: false,
    }),
    JSON.stringify({
      themes: true,
      icons: true,
      palette: true,
      layout: true,
      chart: true,
      background: true,
      cards: false,
      advanced: true,
    }),
  );
});

test("expands or collapses every section as one persisted state", () => {
  assert.deepEqual(
    setAllSectionState(false),
    Object.fromEntries(CONFIGURATOR_SECTION_IDS.map((id) => [id, false])),
  );
  assert.deepEqual(
    setAllSectionState(true),
    Object.fromEntries(CONFIGURATOR_SECTION_IDS.map((id) => [id, true])),
  );
});

test("persists the complete sidebar collapse state independently", async () => {
  const state = await import("../src/configurator/section-state.js");
  assert.equal(typeof state.parseSidebarCollapsed, "function");
  assert.equal(typeof state.serializeSidebarCollapsed, "function");
  assert.equal(state.parseSidebarCollapsed(null), false);
  assert.equal(state.parseSidebarCollapsed("true"), true);
  assert.equal(state.parseSidebarCollapsed("false"), false);
  assert.equal(state.parseSidebarCollapsed("invalid"), false);
  assert.equal(state.serializeSidebarCollapsed(true), "true");
  assert.equal(state.serializeSidebarCollapsed(false), "false");
});
