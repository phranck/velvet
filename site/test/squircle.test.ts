import assert from "node:assert/strict";
import { test } from "bun:test";

import { createSquircleRectPath } from "../src/lib/squircle.js";

test("creates a wide squircle with local corners and straight edges", () => {
  const path = createSquircleRectPath(240, 84, 24);

  assert.match(path, /^M24 0 L216 0 /);
  assert.match(path, /L240 60 /);
  assert.match(path, /L24 84 /);
  assert.match(path, /L0 24 /);
});

test("keeps nested squircle edges aligned at a fixed visual inset", () => {
  const outerPath = createSquircleRectPath(240, 84, 24, 1);
  const innerPath = createSquircleRectPath(240, 84, 24, 5.5);

  assert.match(outerPath, /^M24 1 L216 1 /);
  assert.match(innerPath, /^M24 5\.5 L216 5\.5 /);
});

test("clamps squircle geometry for small or invalid dimensions", () => {
  const smallPath = createSquircleRectPath(20, 10, 24, 1);

  assert.match(smallPath, /^M5 1 L15 1 /);
  assert.doesNotMatch(smallPath, /NaN|Infinity/);
  assert.equal(createSquircleRectPath(0, 84, 24), "");
  assert.equal(createSquircleRectPath(Number.NaN, 84, 24), "");
});
