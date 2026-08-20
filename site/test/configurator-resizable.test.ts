import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  cursorFor,
  resizedTo,
  RESIZE_GRIPS,
  storedSize,
  type ResizeGrip,
} from "../src/configurator/resizable.js";

const START = { width: 800, height: 600 };
const BOUNDS = {
  minimumWidth: 420,
  minimumHeight: 320,
  maximumWidth: 1200,
  maximumHeight: 900,
};

test("a drag changes the size about the centre, so the dialog stays put", () => {
  // The pointer moves 50 out, the opposite edge moves 50 the other way, and
  // the box therefore grows by 100 whilst its centre does not move.
  const wider = resizedTo("e", START, { x: 50, y: 0 }, BOUNDS);

  assert.equal(wider.width, 900);
  assert.equal(wider.height, 600, "a side drag leaves the other measurement");
});

test("the west edge grows the dialog when it is dragged outwards", () => {
  const wider = resizedTo("w", START, { x: -50, y: 0 }, BOUNDS);
  const narrower = resizedTo("w", START, { x: 50, y: 0 }, BOUNDS);

  assert.equal(wider.width, 900);
  assert.equal(narrower.width, 700);
});

test("a corner changes both measurements at once", () => {
  const larger = resizedTo("se", START, { x: 30, y: 20 }, BOUNDS);

  assert.equal(larger.width, 860);
  assert.equal(larger.height, 640);
});

test("every grip stays inside what the window allows", () => {
  for (const grip of RESIZE_GRIPS) {
    const huge = resizedTo(grip, START, { x: 5000, y: 5000 }, BOUNDS);
    const tiny = resizedTo(grip, START, { x: -5000, y: -5000 }, BOUNDS);
    for (const size of [huge, tiny]) {
      assert.ok(size.width >= BOUNDS.minimumWidth, `${grip} width floor`);
      assert.ok(size.width <= BOUNDS.maximumWidth, `${grip} width ceiling`);
      assert.ok(size.height >= BOUNDS.minimumHeight, `${grip} height floor`);
      assert.ok(size.height <= BOUNDS.maximumHeight, `${grip} height ceiling`);
    }
  }
});

test("each edge says which way it moves, and the diagonals disagree", () => {
  assert.equal(cursorFor("n"), "ns-resize");
  assert.equal(cursorFor("s"), "ns-resize");
  assert.equal(cursorFor("e"), "ew-resize");
  assert.equal(cursorFor("w"), "ew-resize");
  assert.equal(cursorFor("ne"), "nesw-resize");
  assert.equal(cursorFor("sw"), "nesw-resize");
  assert.equal(cursorFor("nw"), "nwse-resize");
  assert.equal(cursorFor("se"), "nwse-resize");
  assert.equal(
    new Set(RESIZE_GRIPS.map((grip: ResizeGrip) => cursorFor(grip))).size,
    4,
    "eight edges, four cursors",
  );
});

test("a remembered size is read back, and nonsense is read as nothing", () => {
  const minimum = { width: 420, height: 320 };

  assert.deepEqual(storedSize({ width: 900, height: 700 }, minimum), {
    width: 900,
    height: 700,
  });

  for (const stored of [
    undefined,
    null,
    "800x600",
    { width: 900 },
    { width: "900", height: 700 },
    { width: Number.NaN, height: 700 },
    // Smaller than the dialog may be, which is not a size somebody dragged.
    { width: 100, height: 700 },
    { width: 900, height: 10 },
  ]) {
    assert.equal(
      storedSize(stored, minimum),
      null,
      JSON.stringify(stored) ?? "undefined",
    );
  }
});

test("a size larger than this window is kept as it was dragged", () => {
  // The stylesheet bounds what is drawn, so a dialog dragged wide on a large
  // screen comes back wide there after having been seen on a small one.
  assert.deepEqual(storedSize({ width: 3000, height: 2000 }, { width: 420, height: 320 }), {
    width: 3000,
    height: 2000,
  });
});
