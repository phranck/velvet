import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

/**
 * Rasterises the Velvet mark into the icons browsers cannot take as SVG.
 *
 * `favicon.svg` is the source and is served to anything that understands it,
 * which is every current browser. The bitmaps cover what the vector cannot: an
 * older browser falling back to a PNG, iOS, which reads only
 * `apple-touch-icon`, and everything outside this repository that wants the
 * mark as a picture.
 *
 * The mark itself is the letter V from Plaster, the face the wordmark is set
 * in, taken as an outline so the icon needs no font to render, with the status
 * lamp on its shoulder. `generate-mark.ts` draws it.
 *
 * **None of these files is dead weight.** 256 is not linked from any page and
 * 128 is larger than a tab needs, and both are here on purpose, because they
 * are used away from this repository where a link from a page would not show
 * it. `test/favicon.test.ts` asserts that every one of them exists, so deleting
 * one as unused turns the suite red rather than going unnoticed.
 *
 * Usage: bun scripts/generate-favicons.ts
 */
const assets = resolve(import.meta.dirname, "../src/assets");
const source = readFileSync(resolve(assets, "favicon.svg"), "utf8");

/**
 * iOS applies its own rounding and its own mask, so it is given a full square.
 * Shipping the rounded tile there would round an already rounded corner and
 * leave the icon looking inset against every other icon on the home screen.
 */
const square = source.replace(' rx="112"', "");

const targets = [
  { file: "favicon-96.png", size: 96, svg: source },
  { file: "favicon-128.png", size: 128, svg: source },
  { file: "favicon-256.png", size: 256, svg: source },
  { file: "apple-touch-icon.png", size: 180, svg: square },
] as const;

for (const target of targets) {
  const rendered = new Resvg(target.svg, {
    fitTo: { mode: "width", value: target.size },
  })
    .render()
    .asPng();
  writeFileSync(resolve(assets, target.file), rendered);
  console.log(`${target.file} at ${target.size}px`);
}
