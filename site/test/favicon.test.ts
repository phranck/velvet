import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { test } from "bun:test";

const siteRoot = new URL("../", import.meta.url);

/**
 * Every page a browser can open, and therefore every tab that shows an icon.
 *
 * Read off the directory rather than listed here, so a page added later is
 * covered without anybody remembering to add it.
 */
const PAGES = readdirSync(siteRoot).filter((entry) => entry.endsWith(".html"));

test("every browser surface carries the Velvet icon", () => {
  assert.ok(PAGES.length > 0, "no pages were found to check");

  for (const page of PAGES) {
    const source = readFileSync(new URL(page, siteRoot), "utf8");

    assert.match(
      source,
      /<link rel="icon" href="\.\/src\/assets\/favicon\.svg" type="image\/svg\+xml"/u,
      `${page} must offer the vector icon`,
    );
    // The two raster sizes, for anything that will not take the vector.
    assert.match(
      source,
      /<link rel="icon" href="\.\/src\/assets\/favicon-96\.png" sizes="96x96"/u,
      `${page} must offer the 96px icon`,
    );
    assert.match(
      source,
      /<link rel="icon" href="\.\/src\/assets\/favicon-128\.png" sizes="128x128"/u,
      `${page} must offer the 128px icon`,
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

  // 256 is linked from no page and 128 is larger than a tab needs. Both are
  // kept deliberately, because the mark is used away from this repository too,
  // and this is what stops either being removed as unused.
  for (const bitmap of [
    "favicon-96.png",
    "favicon-128.png",
    "favicon-256.png",
    "apple-touch-icon.png",
  ]) {
    assert.equal(
      existsSync(new URL(`src/assets/${bitmap}`, siteRoot)),
      true,
      `${bitmap} is missing; run scripts/generate-favicons.ts`,
    );
  }
});

/** Reads one custom property out of the shared token file. */
function token(tokens: string, name: string): string {
  const found = tokens.match(new RegExp(`${name}:\\s*([^;]+);`, "u"));
  assert.ok(found, `${name} is not declared in velvet-tokens.css`);
  return found[1].trim();
}

test("the mark is drawn in the colours the design system declares", () => {
  const tokens = readFileSync(new URL("src/lib/velvet-tokens.css", siteRoot), "utf8");
  const surfaces = {
    "velvet-mark.svg": readFileSync(new URL("src/assets/velvet-mark.svg", siteRoot), "utf8"),
    "favicon.svg": readFileSync(new URL("src/assets/favicon.svg", siteRoot), "utf8"),
  };

  // An SVG cannot reach a custom property, because a favicon and a bare mark
  // both render in isolation from any stylesheet. The values are therefore
  // written into the artwork, and this is what stops the two drifting when a
  // token changes and nobody reruns the generator.
  const declared = ["--velvet-mark-blue", "--velvet-mark-apricot", "--velvet-live"] as const;

  for (const [file, svg] of Object.entries(surfaces)) {
    for (const name of declared) {
      assert.ok(
        svg.includes(token(tokens, name)),
        `${file} misses ${name}; run scripts/generate-mark.ts`,
      );
    }
  }
});

test("the mark's box holds the lamp that overhangs the letter", () => {
  const svg = readFileSync(new URL("src/assets/velvet-mark.svg", siteRoot), "utf8");
  const box = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/u);
  assert.ok(box, "the mark must state its own box");
  const [minX, minY, width, height] = box.slice(1).map(Number);

  const circles = [
    ...svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)" fill="([^"]+)"/gu),
  ].map((circle) => ({
    x: Number(circle[1]),
    y: Number(circle[2]),
    radius: Number(circle[3]),
  }));
  assert.equal(circles.length, 2, "one circle cuts the V, the other is the lamp");

  // The cut is drawn first, inside the mask, and has to be the wider of the two
  // or the lamp would sit flush against the letter with nothing between them.
  const [cut, lamp] = circles;
  assert.ok(cut.radius > lamp.radius, "the cut must be wider than the lamp it separates");
  assert.equal(cut.x, lamp.x);
  assert.equal(cut.y, lamp.y);

  // The lamp reaches past the V to the right and above it, so a box taken from
  // the letter alone would clip it.
  assert.ok(lamp.x - lamp.radius >= minX, "the lamp is cut off on the left");
  assert.ok(lamp.x + lamp.radius <= minX + width, "the lamp is cut off on the right");
  assert.ok(lamp.y - lamp.radius >= minY, "the lamp is cut off at the top");
  assert.ok(lamp.y + lamp.radius <= minY + height, "the lamp is cut off at the foot");
});
