import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  createSvelteRenderer,
  type SvelteRenderer,
} from "./render-svelte.js";

let renderer: SvelteRenderer;

before(async () => {
  renderer = await createSvelteRenderer();
});

after(async () => {
  await renderer.close();
});

test("renders one decorative inline-SVG squircle at the requested size", async () => {
  const html = await renderer.render(
    "/src/configurator/ColorSwatch.svelte",
    {
      color: "#6366f1",
      size: 22,
    },
  );

  assert.match(html, /data-color-swatch/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /style="width: 22px; height: 22px;"/);
  assert.match(html, /<svg[^>]+viewBox="0 0 100 100"/);
  assert.match(html, /<path[^>]+data-squircle-shape/);
  assert.match(html, /fill="#6366f1"/);
  assert.match(html, /stroke="var\(--tool-line\)"/);
  assert.doesNotMatch(html, /<rect/);
});

test("keeps an interactive native color input accessible above the squircle", async () => {
  const html = await renderer.render(
    "/test/fixtures/InteractiveColorSwatch.svelte",
    {},
  );

  assert.match(html, /data-color-swatch/);
  assert.doesNotMatch(html, /data-color-swatch[^>]+aria-hidden/);
  assert.match(html, /<input[^>]+type="color"/);
  assert.match(html, /aria-label="Accent color picker"/);
});
