import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "bun:test";

const siteRoot = new URL("../", import.meta.url);

/** Every page a browser can open, and therefore every tab that shows an icon. */
const PAGES = [
  "index.html",
  "onboarding.html",
  "configurator.html",
  "website.html",
] as const;

test("every browser surface carries the Velvet icon", () => {
  for (const page of PAGES) {
    const source = readFileSync(new URL(page, siteRoot), "utf8");

    assert.match(
      source,
      /<link rel="icon" href="\.\/src\/assets\/favicon\.svg" type="image\/svg\+xml"/u,
      `${page} must offer the vector icon`,
    );
    // iOS reads only this one, so a home-screen shortcut falls back to a
    // screenshot of the page without it.
    assert.match(
      source,
      /<link rel="apple-touch-icon" href="\.\/src\/assets\/apple-touch-icon\.png"/u,
      `${page} must offer the iOS icon`,
    );
  }
});

test("the icon renders without needing the font it was drawn from", () => {
  const svg = readFileSync(new URL("src/assets/favicon.svg", siteRoot), "utf8");

  // The mark is the letter V from Plaster, taken as an outline. Left as text it
  // would render in whatever face the viewer happened to have, which for a
  // favicon is usually none of them.
  assert.equal(svg.includes("<text"), false, "the mark must be an outline");
  assert.equal(svg.includes("font-family"), false);
  assert.match(svg, /<path[^>]+d="M/u);
  assert.match(svg, /#8ca5ff/u, "the mark uses the Velvet accent");

  for (const bitmap of ["favicon-96.png", "apple-touch-icon.png"]) {
    assert.equal(
      existsSync(new URL(`src/assets/${bitmap}`, siteRoot)),
      true,
      `${bitmap} is missing; run scripts/generate-favicons.ts`,
    );
  }
});
