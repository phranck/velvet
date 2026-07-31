import assert from "node:assert/strict";
import { test } from "bun:test";

import {
  createSquirclePath,
} from "../src/lib/squircle.js";

test("creates a square superellipse with equal horizontal and vertical bounds", () => {
  const path = createSquirclePath(84, 1, 16);

  assert.match(path, /^M83 42 /);
  assert.match(path, /L42 83 /);
  assert.match(path, /L1 42 /);
  assert.match(path, /L42 1 /);
});

test("keeps nested square superellipses centered at a fixed inset", () => {
  const outerPath = createSquirclePath(84, 1);
  const innerPath = createSquirclePath(84, 5.5);

  assert.match(outerPath, /^M83 42 /);
  assert.match(innerPath, /^M78\.5 42 /);
});

test("rejects invalid square superellipse dimensions", () => {
  assert.equal(createSquirclePath(0, 1), "");
  assert.equal(createSquirclePath(10, 6), "");
  assert.equal(createSquirclePath(Number.NaN, 1), "");
});
