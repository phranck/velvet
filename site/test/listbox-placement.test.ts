import assert from "node:assert/strict";
import { test } from "bun:test";

test("opens upward when the footer leaves more room above the trigger", async () => {
  const { resolveListboxPlacement } = await import(
    "../src/configurator/listbox-placement.js"
  );

  assert.deepEqual(
    resolveListboxPlacement(
      { top: 1_333, bottom: 1_373 },
      { top: 0, bottom: 1_427 },
      430,
    ),
    { placement: "up", maxHeight: 1_327 },
  );
});

test("keeps enough menus below the trigger", async () => {
  const { resolveListboxPlacement } = await import(
    "../src/configurator/listbox-placement.js"
  );

  assert.deepEqual(
    resolveListboxPlacement(
      { top: 100, bottom: 140 },
      { top: 0, bottom: 500 },
      200,
    ),
    { placement: "down", maxHeight: 354 },
  );
});

test("limits oversized menus to the larger available side", async () => {
  const { resolveListboxPlacement } = await import(
    "../src/configurator/listbox-placement.js"
  );

  assert.deepEqual(
    resolveListboxPlacement(
      { top: 250, bottom: 290 },
      { top: 0, bottom: 500 },
      600,
    ),
    { placement: "up", maxHeight: 244 },
  );
});
