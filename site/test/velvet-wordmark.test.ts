import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterAll, beforeAll, test } from "bun:test";

import {
  createSvelteRenderer,
  type SvelteRenderer,
} from "./render-svelte.js";

let renderer: SvelteRenderer;

beforeAll(async () => {
  renderer = await createSvelteRenderer();
});

afterAll(async () => {
  await renderer.close();
});

test("renders the shared Plaster Velvet wordmark as text or a link", async () => {
  const text = await renderer.render(
    "/src/components/VelvetWordmark.svelte",
    {},
  );
  const link = await renderer.render(
    "/src/components/VelvetWordmark.svelte",
    { href: "https://github.com/phranck/velvet" },
  );

  assert.match(text, /<span[^>]+class="velvet-wordmark/);
  assert.match(text, />Velvet<\/span>/);
  assert.match(link, /<a[^>]+href="https:\/\/github\.com\/phranck\/velvet"/);
  assert.match(link, />Velvet<\/a>/);
});

test("loads the locally bundled Plaster font under its shared wordmark", async () => {
  const globalStyles = await readFile(
    resolve(import.meta.dirname, "../src/app.css"),
    "utf8",
  );
  const wordmark = await readFile(
    resolve(import.meta.dirname, "../src/components/VelvetWordmark.svelte"),
    "utf8",
  );

  // Through Velvet's own declaration rather than the stylesheet `@fontsource`
  // ships, which states `font-display: swap` and would let the wordmark change
  // shape after the page has drawn.
  assert.match(globalStyles, /@import "\.\/lib\/velvet-typefaces\.css"/);
  assert.match(wordmark, /font-family:\s*"Plaster"/);
});
