import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Draws the Velvet mark from the wordmark outlines and writes both the bare
 * mark and the browser icon.
 *
 * The mark is the V of the wordmark with a status lamp on its shoulder. The two
 * halves are separate contours in Plaster, so each takes its own colour without
 * anything being cut apart, and the lamp says what the product is for.
 *
 * Everything is derived here rather than drawn by hand, because the same curves
 * would otherwise sit in the wordmark, in the icon, and in the mark, and a
 * change to the brand would mean finding all three. The colours come from
 * `velvet-tokens.css` for the same reason.
 *
 * Usage: bun scripts/generate-mark.ts
 */

const siteRoot = resolve(import.meta.dirname, "..");
const assets = resolve(siteRoot, "src/assets");
const wordmark = JSON.parse(
  readFileSync(resolve(siteRoot, "../scripts/velvet-wordmark.json"), "utf8"),
) as { path: string; capHeight: number };
const tokens = readFileSync(resolve(siteRoot, "src/lib/velvet-tokens.css"), "utf8");

/**
 * Reads one custom property out of the shared token file.
 *
 * @param name - The property to look up, written as it is declared, so
 *   `--velvet-operational`.
 * @returns The value as it stands in the file.
 * @throws When the property is absent, because a mark drawn in a colour the
 *   design system does not declare is the thing this is here to prevent.
 */
function token(name: string): string {
  const found = tokens.match(new RegExp(`${name}:\\s*([^;]+);`, "u"));
  if (!found) throw new Error(`${name} is not declared in velvet-tokens.css`);
  return found[1].trim();
}

/**
 * The wordmark is one path of fourteen contours, in the order the six letters
 * are drawn. The first two are the V, and the right half is drawn before the
 * left.
 */
const [rightHalf, leftHalf] = wordmark.path.split(/(?=M)/u).filter(Boolean);

/** The V's ink box within the wordmark, measured off those two contours. */
const INK_LEFT = 9.5518;
const MARK_WIDTH = 93.61;
const CAP_HEIGHT = wordmark.capHeight;

/**
 * The lamp, sitting on the shoulder of the V. It overlaps the right half, so a
 * ring of the V is cut away around it rather than drawn in any colour: cut, the
 * lamp reads the same against a dark tile, a white page, and a screenshot.
 */
const LAMP_X = MARK_WIDTH - 4;
const LAMP_Y = 10;
const LAMP_RADIUS = 11;
const LAMP_CLEARANCE = 17;

/**
 * The box, taken from what is actually drawn. The lamp reaches past the V on
 * two sides, so the mark is wider and taller than the letter it is built on.
 */
const boxTop = Math.min(0, LAMP_Y - LAMP_RADIUS);
const boxRight = Math.max(MARK_WIDTH, LAMP_X + LAMP_RADIUS);
const MARK_HEIGHT = CAP_HEIGHT - boxTop;

/**
 * Rewrites an SVG path built of M, Q, H, V, L, and Z, shifting every coordinate
 * and rounding it.
 *
 * The wordmark states the baseline at y 0 with the letters above it at negative
 * y, which is what a font gives. A drawing wants the box to start at its own top
 * left, so both axes move.
 *
 * @param path - The contour to rewrite.
 * @param dx - What to add to every x.
 * @param dy - What to add to every y.
 * @param places - Decimal places to keep.
 * @returns The rewritten path.
 */
function shiftPath(path: string, dx: number, dy: number, places = 2): string {
  const parsed = path.match(/[MQHVLZ]|-?\d+(?:\.\d+)?/gu) ?? [];
  const parts: string[] = [];
  const format = (value: number) => String(Number(value.toFixed(places)));
  let index = 0;
  let command = "";
  const next = () => Number(parsed[index++]);

  while (index < parsed.length) {
    if (/[MQHVLZ]/u.test(parsed[index])) {
      command = parsed[index++];
      parts.push(command);
    }
    if (command === "Z") continue;
    if (command === "M" || command === "L") {
      parts.push(`${format(next() + dx)} ${format(next() + dy)}`);
    } else if (command === "H") {
      parts.push(format(next() + dx));
    } else if (command === "V") {
      parts.push(format(next() + dy));
    } else if (command === "Q") {
      parts.push(
        `${format(next() + dx)} ${format(next() + dy)} ${format(next() + dx)} ${format(next() + dy)}`,
      );
    }
  }
  return parts.join("").replaceAll(/(\d)([MQHVLZ])/gu, "$1$2");
}

const left = shiftPath(leftHalf, -INK_LEFT, CAP_HEIGHT);
const right = shiftPath(rightHalf, -INK_LEFT, CAP_HEIGHT);

/**
 * The mask covers the whole box and punches the clearance out of it, so the two
 * halves lose a ring where the lamp sits. It is generously larger than the box
 * on every side, because a mask that stops at an edge leaves a hairline there.
 */
const MASK_ID = "velvet-lamp";
const maskMargin = 8;
const artwork = `<mask id="${MASK_ID}">
      <rect x="${-maskMargin}" y="${boxTop - maskMargin}" width="${boxRight + maskMargin * 2}" height="${MARK_HEIGHT + maskMargin * 2}" fill="#fff"/>
      <circle cx="${LAMP_X}" cy="${LAMP_Y}" r="${LAMP_CLEARANCE}" fill="#000"/>
    </mask>
    <g mask="url(#${MASK_ID})">
      <path d="${left}" fill="${token("--velvet-mark-blue")}"/>
      <path d="${right}" fill="${token("--velvet-mark-apricot")}"/>
    </g>
    <circle cx="${LAMP_X}" cy="${LAMP_Y}" r="${LAMP_RADIUS}" fill="${token("--velvet-live")}"/>`;

writeFileSync(
  resolve(assets, "velvet-mark.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${boxTop} ${boxRight} ${MARK_HEIGHT}" role="img" aria-label="Velvet">
  <title>Velvet</title>
  <g>
    ${artwork}
  </g>
</svg>
`,
);

/**
 * The icon tile, at the size and rounding a browser and a home screen expect.
 * The mark takes a share of the tile that keeps it clear of the rounded
 * corners, and is centred on what is left.
 */
const TILE = 512;
const TILE_RADIUS = 112;
const MARK_SHARE = 0.68;

const scale = (TILE * MARK_SHARE) / MARK_HEIGHT;
const offsetX = (TILE - boxRight * scale) / 2;
// The artwork starts at the top of the lamp rather than at zero, so centring it
// means allowing for where it starts.
const offsetY = (TILE - MARK_HEIGHT * scale) / 2 - boxTop * scale;

writeFileSync(
  resolve(assets, "favicon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${TILE}" role="img" aria-label="Velvet">
  <title>Velvet</title>
  <rect width="${TILE}" height="${TILE}" rx="${TILE_RADIUS}" fill="${token("--velvet-surface-sunken")}"/>
  <g transform="translate(${offsetX.toFixed(2)} ${offsetY.toFixed(2)}) scale(${scale.toFixed(5)})">
    ${artwork}
  </g>
</svg>
`,
);

console.log(`velvet-mark.svg at ${boxRight} x ${MARK_HEIGHT}, from y ${boxTop}`);
console.log(`favicon.svg at ${TILE}, mark filling ${(MARK_SHARE * 100).toFixed(0)}%`);
