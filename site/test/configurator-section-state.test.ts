import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  CONFIGURATOR_SECTION_IDS,
  parseSectionState,
  serializeSectionState,
  setAllSectionState,
} from "../src/configurator/section-state.js";

test("starts a first visit with every section collapsed", () => {
  // A first visit should open as a short list of what can be configured,
  // rather than as one long scroll the reader has to close first.
  assert.deepEqual(parseSectionState(null),
    Object.fromEntries(CONFIGURATOR_SECTION_IDS.map((id) => [id, false])),
  );
});

test("restores known expanded sections and ignores malformed storage", () => {
  const restored = parseSectionState(
    JSON.stringify({ layout: true, chart: true, unknown: true }),
  );

  assert.equal(restored.layout, true);
  assert.equal(restored.chart, true);
  assert.equal(restored.palette, false);
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
      cards: true,
      ignored: true,
    }),
    JSON.stringify({
      updates: false,
      themes: false,
      icons: false,
      palette: false,
      layout: false,
      chart: false,
      background: false,
      cards: true,
      advanced: false,
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
