import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  clampWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  moveSection,
  placeSectionAt,
  reconcileOrder,
  SECTION_KEYS,
  type SectionKey,
} from "../src/configurator/sidebar-state.js";

test("holds a width inside its bounds, whatever arrives", () => {
  assert.equal(clampWidth(MIN_SIDEBAR_WIDTH - 100), MIN_SIDEBAR_WIDTH);
  assert.equal(clampWidth(MAX_SIDEBAR_WIDTH + 100), MAX_SIDEBAR_WIDTH);
  assert.equal(clampWidth(400), 400);
  assert.equal(clampWidth(400.6), 401, "a drag lands on fractions of a pixel");
  assert.equal(
    clampWidth(Number.NaN) >= MIN_SIDEBAR_WIDTH,
    true,
    "a width that is not a number is not a width",
  );
});

test("a stored order survives a section being added or removed", () => {
  // What a browser holding an older arrangement would have stored: some of the
  // current sections, in an order somebody chose.
  const stored = ["theme", "installation", "services"];

  const order = reconcileOrder(stored);

  // The arrangement is a relative one, so that is what has to survive. The
  // two sections this browser never saw are inserted where they stand by
  // default, and one of them falls between two that were arranged.
  assert.ok(
    order.indexOf("theme") < order.indexOf("installation"),
    "what somebody arranged stays arranged",
  );
  assert.ok(
    order.indexOf("installation") < order.indexOf("services"),
    "what somebody arranged stays arranged",
  );
  assert.equal(
    order.indexOf("global"),
    order.indexOf("installation") + 1,
    "a new section lands at its place in the default order",
  );
  assert.equal(
    new Set(order).size,
    SECTION_KEYS.length,
    "every current section appears exactly once",
  );
  for (const key of SECTION_KEYS) {
    assert.ok(order.includes(key), `${key} is missing`);
  }
});

test("a section that no longer exists is dropped rather than kept", () => {
  const order = reconcileOrder(["installation", "gallery", "theme"]);

  assert.equal(order.includes("gallery" as SectionKey), false);
  assert.equal(new Set(order).size, SECTION_KEYS.length);
});

test("a new section lands among its default neighbours, not at the end", () => {
  // Everything except the second key, as an older browser would have it.
  const [first, second, ...rest] = SECTION_KEYS;
  const stored = [first, ...rest];

  const order = reconcileOrder(stored);

  assert.equal(
    order.indexOf(second!),
    1,
    "the section returns to where its neighbours would lead somebody to look",
  );
});

test("nothing stored at all gives the default order", () => {
  assert.deepEqual(reconcileOrder(undefined), [...SECTION_KEYS]);
  assert.deepEqual(reconcileOrder("not an array"), [...SECTION_KEYS]);
  assert.deepEqual(reconcileOrder([]), [...SECTION_KEYS]);
});

test("moves a section by a step, and refuses to move it out of the list", () => {
  const order = [...SECTION_KEYS];
  const first = order[0]!;
  const last = order[order.length - 1]!;

  assert.deepEqual(
    moveSection(order, first, -1),
    order,
    "the first section cannot move up",
  );
  assert.deepEqual(
    moveSection(order, last, 1),
    order,
    "the last section cannot move down",
  );
  const moved = moveSection(order, first, 1);
  assert.equal(moved[1], first);
  assert.equal(moved[0], order[1]);
  assert.equal(moved.length, order.length);
});

test("a drop puts the carried section into the gap it was held over", () => {
  const order = [...SECTION_KEYS];
  const carried = order[3]!;
  const displaced = order[1]!;

  const placed = placeSectionAt(order, carried, 1);

  assert.equal(placed.indexOf(carried), 1, "it lands in the gap above the second");
  assert.equal(placed.indexOf(displaced), 2, "and what stood there moves down");
  assert.equal(placed.length, order.length);
  assert.equal(new Set(placed).size, order.length);
});

test("a drop below the last section puts it at the end", () => {
  const order = [...SECTION_KEYS];
  const carried = order[0]!;

  const placed = placeSectionAt(order, carried, order.length);

  assert.equal(placed.indexOf(carried), order.length - 1);
  assert.equal(new Set(placed).size, order.length);
});

test("a drop into either gap beside where it already stands changes nothing", () => {
  const order = [...SECTION_KEYS];
  const key = order[2]!;

  // Taking it out closes one gap, so the gap above it and the gap below it are
  // both the place it already occupies.
  assert.deepEqual(placeSectionAt(order, key, 2), order);
  assert.deepEqual(placeSectionAt(order, key, 3), order);
  assert.deepEqual(placeSectionAt(order, "gallery" as SectionKey, 1), order);
});

test("the pinned section is not among the ones that can be arranged", () => {
  assert.equal(
    SECTION_KEYS.includes("updates" as SectionKey),
    false,
    "update notices stand at the top and are not arranged out of the way",
  );
});
