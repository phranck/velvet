import assert from "node:assert/strict";
import { afterAll, beforeAll, test } from "bun:test";

import { createSvelteRenderer, type SvelteRenderer } from "./render-svelte.js";

const FIXTURE = "/test/fixtures/ReleaseNotesOverlay.svelte";

/**
 * Strips the comment markers Svelte emits around every server-rendered block,
 * so an assertion can describe the element structure a reader gets rather than
 * the framework's bookkeeping.
 */
function elements(html: string): string {
  return html.replaceAll(/<!--.*?-->/gu, "");
}

let renderer: SvelteRenderer;

beforeAll(async () => {
  renderer = await createSvelteRenderer();
});

afterAll(async () => {
  await renderer.close();
});

test("presents the notes in a labelled modal with an install action", async () => {
  const html = await renderer.render(FIXTURE, {
    open: true,
    source: "# Velvet 2.0.0\n\nA native monitor.\n\n- One\n- Two\n",
  });

  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-label="Release notes"/);
  assert.match(html, /aria-label="Close"/);
  assert.match(html, /Install update/);
  const rendered = elements(html);
  assert.match(rendered, /<h2[^>]*>Velvet 2\.0\.0<\/h2>/);
  assert.match(rendered, /<li[^>]*>One<\/li>/);
  assert.match(rendered, /<li[^>]*>Two<\/li>/);
});

test("renders nothing at all while it is closed", async () => {
  const html = await renderer.render(FIXTURE, { open: false, source: "# Hidden\n" });

  assert.equal(html.includes("role=\"dialog\""), false);
  assert.equal(html.includes("Hidden"), false);
  assert.equal(html.includes("Install update"), false);
});

test("cannot be made to emit markup from a release note", async () => {
  const html = await renderer.render(FIXTURE, {
    open: true,
    source:
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[bad](javascript:alert(1))\n',
  });

  const rendered = elements(html);
  assert.equal(rendered.includes("<script"), false, "no script element");
  assert.equal(rendered.includes("<img"), false, "no image element");
  // An event handler can only execute as an attribute of an element. With no
  // element emitted, the surviving `onerror=` text is inert, and asserting it
  // arrived escaped proves that directly.
  assert.match(
    rendered,
    /&lt;img src=x onerror=/u,
    "the image markup arrives as escaped text",
  );
  assert.equal(
    rendered.includes('href="javascript:'),
    false,
    "no executable link target",
  );
  assert.equal(rendered.includes("<a "), false, "the unsafe link is not a link");
  // Escaping the opening angle bracket is what makes the text inert; the
  // closing one carries no meaning on its own and Svelte leaves it as is.
  assert.match(
    rendered,
    /&lt;script>alert\(1\)/u,
    "the script markup survives as readable text",
  );
  assert.match(rendered, /bad/, "the link label stays readable");
});

test("keeps a safe link and marks it as an external destination", async () => {
  const html = await renderer.render(FIXTURE, {
    open: true,
    source: "See [the docs](https://velvet.li/docs).",
  });

  assert.match(html, /href="https:\/\/velvet\.li\/docs"/);
  assert.match(html, /rel="noreferrer noopener"/);
});
