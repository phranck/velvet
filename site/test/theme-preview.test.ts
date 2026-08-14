import assert from "node:assert/strict";
import { test } from "bun:test";

import { themePreviewDocument } from "../src/lib/themes/preview.js";

/**
 * A preview puts a theme beside the surface previewing it. The frame is what
 * keeps the two apart, and these are the properties that make it a frame rather
 * than a container.
 */

test("carries the theme's markup and its whole stylesheet", () => {
  const document = themePreviewDocument({
    title: "Proof",
    markup: `<div class="proof-page">Everything is fine</div>`,
    css: `.proof-page { color: #101014; }`,
  });
  assert.match(document, /^<!doctype html>/);
  assert.match(document, /<div class="proof-page">Everything is fine<\/div>/);
  assert.match(document, /\.proof-page \{ color: #101014; \}/);
  assert.match(document, /<title>Proof<\/title>/);
});

test("a stylesheet cannot end the element that carries it", () => {
  const document = themePreviewDocument({
    title: "Proof",
    markup: "",
    // A theme that wrote this into a stylesheet would otherwise close the
    // element and have the rest of its sheet parsed as markup.
    css: `.a { content: "</style><script>alert(1)</script>"; }`,
  });
  assert.doesNotMatch(document, /<\/style><script>/);
});

test("names the theme in a way a reader and a screen reader both get", () => {
  const document = themePreviewDocument({
    title: `Retro Chassis "1979" <futurism>`,
    markup: "",
    css: "",
  });
  assert.match(document, /<title>Retro Chassis &quot;1979&quot; &lt;futurism&gt;<\/title>/);
});
