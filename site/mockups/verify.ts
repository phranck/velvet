/**
 * The gates that make the theme contract testable rather than merely stated.
 *
 * Run with `bun site/mockups/verify.ts` from the repository root. Everything
 * here is mechanical: no gate depends on somebody looking at a page, because a
 * person looking at a page is exactly what these gates exist to replace.
 *
 * Five checks, in the order a failure is cheapest to fix:
 *
 *   1. Separation of concerns. `base.css` carries no colour, no font family and
 *      no shape of its own, so a theme file really is the whole design.
 *   2. Completeness. Every custom property `base.css` reads is defined by every
 *      theme, so no theme renders as a mixture of two designs.
 *   3. Contrast. Text reaches 4.5:1 and graphics reach 3:1 against the surfaces
 *      they actually stand on.
 *   4. Separation of meaning. The accent and the outage colour, and the three
 *      state colours pairwise, are far enough apart to be told apart.
 *   5. Fixture validity. The dummy data satisfies the real contract schemas, so
 *      a mockup exercises the document a published page renders.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The product's own validators rather than the raw schemas. They check what a
// schema cannot: duplicate identifiers, timestamps outside the document's own
// window, and durations that contradict each other. A fixture that satisfies
// the schema but not these would still be a document Velvet refuses.
import {
  validateIncidentsDocument,
  validateResponseTimesDocument,
  validateStatusDocument,
} from "@velvet/contracts";
import {
  incidentsDocument,
  responseTimesDocument,
  statusDocument,
} from "./dummy-data.js";

const here = dirname(fileURLToPath(import.meta.url));
const failures: string[] = [];
const notes: string[] = [];

/** Records a failed gate with the file it belongs to. */
function fail(gate: string, detail: string): void {
  failures.push(`${gate}: ${detail}`);
}

// ── Colour arithmetic ───────────────────────────────────────────────────────
// Contrast follows WCAG 2.1 relative luminance. Hue and chroma come from OKLCH,
// which is perceptually uniform, so a fixed degree threshold means the same
// thing everywhere on the wheel. sRGB hue does not have that property.

type Rgb = [number, number, number];

/** Parses the colour notations a theme is allowed to use. */
function parseColour(value: string): Rgb | null {
  const text = value.trim();
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1]!;
    const full =
      digits.length === 3
        ? digits
            .split("")
            .map((digit) => digit + digit)
            .join("")
        : digits;
    return [
      Number.parseInt(full.slice(0, 2), 16),
      Number.parseInt(full.slice(2, 4), 16),
      Number.parseInt(full.slice(4, 6), 16),
    ];
  }
  const rgb = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  // A two-colour mix in sRGB, which is how a theme states a colour derived from
  // another rather than a second literal beside it. Mixed componentwise, which
  // is what `in srgb` means; any other colour space would need its own
  // conversion and no theme asks for one.
  const mix = text.match(
    /^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/i,
  );
  if (mix) {
    const first = parseColour(mix[1]!);
    const second = parseColour(mix[3]!);
    if (!first || !second) return null;
    const weight = Number(mix[2]) / 100;
    return first.map((channel, at) =>
      Math.round(channel * weight + second[at]! * (1 - weight)),
    ) as Rgb;
  }
  return null;
}

/** The alpha of a colour, or 1 where none is stated. */
function alphaOf(value: string): number {
  const slash = value.match(/\/\s*([\d.]+)\s*\)/);
  if (slash) return Number(slash[1]);
  const comma = value.match(
    /rgba\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+[\s,]+([\d.]+)/i,
  );
  return comma ? Number(comma[1]) : 1;
}

function toLinear(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.03928
    ? scaled / 12.92
    : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: Rgb): number {
  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
}

function contrast(front: Rgb, back: Rgb): number {
  const first = luminance(front);
  const second = luminance(back);
  const [high, low] = first > second ? [first, second] : [second, first];
  return (high + 0.05) / (low + 0.05);
}

/** Lays a translucent colour over an opaque one, which is what the eye sees. */
function over(front: Rgb, back: Rgb, alpha: number): Rgb {
  return [
    front[0] * alpha + back[0] * (1 - alpha),
    front[1] * alpha + back[1] * (1 - alpha),
    front[2] * alpha + back[2] * (1 - alpha),
  ];
}

function oklch([red, green, blue]: Rgb): {
  lightness: number;
  chroma: number;
  hue: number;
} {
  const linearRed = toLinear(red);
  const linearGreen = toLinear(green);
  const linearBlue = toLinear(blue);
  const long = Math.cbrt(
    0.4122214708 * linearRed + 0.5363325363 * linearGreen + 0.0514459929 * linearBlue,
  );
  const medium = Math.cbrt(
    0.2119034982 * linearRed + 0.6806995451 * linearGreen + 0.1073969566 * linearBlue,
  );
  const short = Math.cbrt(
    0.0883024619 * linearRed + 0.2817188376 * linearGreen + 0.6299787005 * linearBlue,
  );
  const lightness = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short;
  const greenRed = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const blueYellow = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  let hue = (Math.atan2(blueYellow, greenRed) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return { lightness, chroma: Math.hypot(greenRed, blueYellow), hue };
}

/**
 * How far apart two colours are in a way a reader can act on.
 *
 * A hue comparison alone is wrong, and the Cosmist theme is what proves it: its
 * accent is black, whose hue is meaningless because its chroma is nearly zero.
 * Where either colour is that close to grey, the pair is separated by chroma
 * instead and the hue test does not apply.
 *
 * @param first - One colour.
 * @param second - The other.
 * @returns The hue distance in degrees, or null where the pair is separated by
 *   chroma and no hue comparison is meaningful.
 */
function separation(first: Rgb, second: Rgb): number | null {
  const one = oklch(first);
  const other = oklch(second);
  const GREY_CHROMA = 0.04;
  if (one.chroma < GREY_CHROMA || other.chroma < GREY_CHROMA) {
    return Math.abs(one.chroma - other.chroma) >= GREY_CHROMA ? null : 0;
  }
  const distance = Math.abs(one.hue - other.hue);
  return distance > 180 ? 360 - distance : distance;
}

// ── Reading the stylesheets ─────────────────────────────────────────────────

const baseCss = readFileSync(join(here, "base.css"), "utf8");
/** Everything before the toolbar, which is scaffolding rather than design. */
const TOOLBAR_MARKER = "/* ══ The mockup toolbar";
if (!baseCss.includes(TOOLBAR_MARKER)) {
  fail("structure", "base.css no longer marks where the toolbar begins");
}
const baseDesign = baseCss.slice(0, baseCss.indexOf(TOOLBAR_MARKER));

/** Strips comments, so prose about a colour is not mistaken for one. */
function withoutComments(css: string): string {
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, "");
}

// ── Gate 1: base.css carries no design values ───────────────────────────────

const designLiterals: Array<{ name: string; pattern: RegExp }> = [
  { name: "hex colour", pattern: /#[0-9a-f]{3,8}\b/gi },
  { name: "rgb/rgba colour", pattern: /\brgba?\([^)]*\)/g },
  { name: "hsl colour", pattern: /\bhsla?\([^)]*\)/g },
  { name: "named font", pattern: /font-family:\s*(?!var\()[^;]+;/g },
  { name: "literal shadow", pattern: /box-shadow:\s*(?!var\()(?!none)[^;]+;/g },
];

const cleanBase = withoutComments(baseDesign);
for (const { name, pattern } of designLiterals) {
  const hits = [...cleanBase.matchAll(pattern)]
    .map((hit) => hit[0])
    // `linear-gradient(#000 0 0)` is a mask, not a colour anyone sees: the
    // value is opaque black because a mask reads alpha and nothing else.
    .filter((hit) => !cleanBase.includes(`linear-gradient(${hit}`))
    .filter((hit) => !hit.includes("var(--"));
  if (hits.length > 0) {
    fail(
      "no design values in base.css",
      `${hits.length} ${name}(s): ${hits.map((hit) => hit.slice(0, 44)).join(" | ")}`,
    );
  }
}

// ── Gate 2: every theme defines every token base.css reads ──────────────────

const read = new Set(
  [...cleanBase.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((match) => match[1]!),
);

/**
 * Properties a theme is not asked to define.
 *
 * `--status-colour` and `--series-colour` are set by `base.css` from a data
 * attribute, `--strip-surface-height` is written by the strip once it has
 * measured itself, `--notice-cap` is written onto each notice once it has been
 * measured, `--powered-label-tracking` is worked out from the two faces in the
 * credit, the card and notice values are derived, the service colours are a
 * list a theme may leave out entirely, the two edge values are set per
 * surface, the two card paddings are optional overrides that fall back to
 * the card's own, and `--hero-mark-colour` is an optional override with a
 * documented fallback. All of them are structure rather than design.
 */
const structural = new Set([
  "--status-colour",
  "--series-colour",
  "--strip-surface-height",
  "--notice-cap",
  "--powered-label-tracking",
  "--card-inner-radius",
  "--card-text-inset",
  "--notice-inner-radius",
  "--notice-text-inset",
  "--edge-width",
  "--edge-colour",
  "--hero-mark-colour",
  "--card-padding-top",
  "--card-padding-bottom",
  "--series-own",
  "--series-next",
  "--service-colour-1",
  "--service-colour-2",
  "--service-colour-3",
  "--service-colour-4",
  "--service-colour-5",
  "--service-colour-6",
  "--service-colour-7",
  "--service-colour-8",
  "--service-colour-9",
  "--service-colour-10",
  "--backdrop-drift",
  "--detail-radius",
  "--service-rail-radius-last",
]);
const required = [...read].filter((name) => !structural.has(name)).sort();

const themeDir = join(here, "themes");
const themeFiles = readdirSync(themeDir).filter((file) => file.endsWith(".css"));
if (themeFiles.length === 0) fail("completeness", "no theme files found");

const themes = new Map<string, Map<string, string>>();
for (const file of themeFiles) {
  const css = withoutComments(readFileSync(join(themeDir, file), "utf8"));
  const declared = new Map<string, string>();
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    declared.set(match[1]!, match[2]!.trim());
  }
  themes.set(file, declared);

  const missing = required.filter((name) => !declared.has(name));
  if (missing.length > 0) {
    fail("completeness", `${file} does not define ${missing.join(", ")}`);
  }
  const unused = [...declared.keys()].filter(
    (name) =>
      !read.has(name) &&
      !name.startsWith("--theme-") &&
      name !== "--velvet-disclosure-duration",
  );
  if (unused.length > 0) {
    notes.push(`${file}  defines ${unused.length} token(s) nothing reads: ${unused.join(", ")}`);
  }
}

// ── Gates 3 and 4: contrast and separation ──────────────────────────────────

/** Resolves a token to an rgb triplet, following `var()` indirection. */
function resolve(
  declared: Map<string, string>,
  name: string,
  depth = 0,
): { rgb: Rgb; alpha: number } | null {
  const raw = declared.get(name);
  if (raw === undefined || depth > 4) return null;
  const indirect = raw.match(/^var\(\s*(--[a-z0-9-]+)/);
  if (indirect) return resolve(declared, indirect[1]!, depth + 1);
  const rgb = parseColour(raw);
  return rgb ? { rgb, alpha: alphaOf(raw) } : null;
}

/** Contrast of one token against a surface, flattening any transparency. */
function check(
  file: string,
  declared: Map<string, string>,
  front: string,
  back: string,
  minimum: number,
  kind: string,
): void {
  const foreground = resolve(declared, front);
  // A surface a theme deliberately leaves unfilled is measured against the page
  // behind it, which is what a reader actually sees through it.
  const unfilled = declared.get(back)?.trim() === "transparent";
  const background = unfilled
    ? resolve(declared, "--surface-base")
    : resolve(declared, back);
  if (!foreground || !background) {
    fail("contrast", `${file}: cannot resolve ${front} or ${back}`);
    return;
  }
  const ratio = contrast(
    over(foreground.rgb, background.rgb, foreground.alpha),
    background.rgb,
  );
  const where = unfilled ? `the page behind ${back}` : back;
  if (ratio < minimum) {
    fail(
      "contrast",
      `${file}: ${front} on ${where} is ${ratio.toFixed(2)}:1, below ${minimum}:1 for ${kind}`,
    );
  } else {
    notes.push(`${file}  ${front} on ${where}  ${ratio.toFixed(2)}:1`);
  }
}

const TEXT_MINIMUM = 4.5;
const GRAPHIC_MINIMUM = 3;
const MINIMUM_DEGREES = 45;

for (const [file, declared] of themes) {
  for (const surface of ["--surface-base", "--surface-card"]) {
    check(file, declared, "--text-1", surface, TEXT_MINIMUM, "body text");
    check(file, declared, "--text-2", surface, TEXT_MINIMUM, "secondary text");
    for (const state of [
      "--state-operational",
      "--state-degraded",
      "--state-outage",
      "--state-maintenance",
    ]) {
      check(file, declared, state, surface, GRAPHIC_MINIMUM, "a strip segment");
    }
    /*
      The no-data state is measured differently, and deliberately.

      A day nothing was recorded on is meant to read as an absence, so a fill
      that stood out from the page as strongly as a working day would say the
      opposite of what it means. What has to be visible is that a segment is
      there at all, and where such a day draws an inset edge that is what
      carries it, so the edge is what must clear the page whilst the fill only
      has to be separable from a working day.

      A theme may draw no edge at all, saying so by giving it the fill's own
      colour. Then there is nothing to hold to the page, and the day is told
      apart by its neighbours instead: the check below, that an empty day does
      not look like a working one, is the whole requirement in that case.
    */
    const edge = declared.get("--state-ghost-edge")?.trim();
    const outlined = edge !== "var(--state-no-data)";
    if (outlined) {
      check(
        file,
        declared,
        "--state-ghost-edge",
        surface,
        GRAPHIC_MINIMUM,
        "the edge of an empty day",
      );
    }
  }
  const noData = resolve(declared, "--state-no-data");
  const working = resolve(declared, "--state-operational");
  if (noData && working) {
    const ratio = contrast(noData.rgb, working.rgb);
    if (ratio < GRAPHIC_MINIMUM) {
      fail(
        "contrast",
        `${file}: --state-no-data against --state-operational is ${ratio.toFixed(2)}:1, below ${GRAPHIC_MINIMUM}:1, so an empty day looks like a working one`,
      );
    } else {
      notes.push(
        `${file}  --state-no-data vs --state-operational  ${ratio.toFixed(2)}:1`,
      );
    }
  }
  check(file, declared, "--popover-text", "--surface-popover", TEXT_MINIMUM, "tooltip text");
  check(file, declared, "--protocol-ipv4", "--surface-card", GRAPHIC_MINIMUM, "a series line");
  check(file, declared, "--protocol-ipv6", "--surface-card", GRAPHIC_MINIMUM, "a series line");

  const pairs: Array<[string, string]> = [
    ["--accent", "--state-outage"],
    ["--state-operational", "--state-degraded"],
    ["--state-operational", "--state-outage"],
    ["--state-degraded", "--state-outage"],
  ];
  for (const [first, second] of pairs) {
    const one = resolve(declared, first);
    const other = resolve(declared, second);
    if (!one || !other) {
      fail("separation", `${file}: cannot resolve ${first} or ${second}`);
      continue;
    }
    const degrees = separation(one.rgb, other.rgb);
    if (degrees === null) {
      notes.push(`${file}  ${first} vs ${second}  separated by chroma`);
      continue;
    }
    if (degrees < MINIMUM_DEGREES) {
      fail(
        "separation",
        `${file}: ${first} and ${second} are ${degrees.toFixed(1)} degrees apart, below ${MINIMUM_DEGREES}`,
      );
    } else {
      notes.push(`${file}  ${first} vs ${second}  ${degrees.toFixed(1)} deg`);
    }
  }
}

// ── Gate 5: the fixture satisfies the real schemas ──────────────────────────

for (const [name, validate, document] of [
  ["status.json", validateStatusDocument, statusDocument],
  ["response-times.json", validateResponseTimesDocument, responseTimesDocument],
  ["incidents.json", validateIncidentsDocument, incidentsDocument],
] as const) {
  const result = validate(document);
  if (result.success) {
    notes.push(`fixture  ${name} accepted by the v1 validator`);
  } else {
    for (const error of result.errors.slice(0, 4)) {
      fail("fixture", `${name} ${error.path}: ${error.code} ${error.message}`);
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

/*
  `--tokens` prints the contract itself rather than checking it.

  The list is derived from what `base.css` actually reads, so it cannot drift
  from the code the way a list kept in a document would. `theme-authoring.md`
  points here rather than repeating it.
*/
if (process.argv.includes("--tokens")) {
  const groups = new Map<string, string[]>();
  for (const name of required) {
    const key = name.split("-")[2] ?? name;
    groups.set(key, [...(groups.get(key) ?? []), name]);
  }
  console.log(`${required.length} required tokens, in ${groups.size} groups.\n`);
  for (const key of [...groups.keys()].sort()) {
    console.log(`  ${key}`);
    for (const name of groups.get(key)!) {
      const values = [...themes]
        .map(([file, declared]) => `${file.replace(".css", "")}=${declared.get(name) ?? "MISSING"}`)
        .join("  ");
      console.log(`    ${name.padEnd(30)} ${values}`);
    }
  }
  console.log("\nOptional, with a documented fallback:");
  for (const name of [...structural].sort()) console.log(`  ${name}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

console.log(
  `Checked ${themes.size} theme(s) against ${required.length} required tokens.\n`,
);
for (const note of notes) console.log(`  ok    ${note}`);
console.log("");
if (failures.length === 0) {
  console.log("All gates passed.");
} else {
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  console.log(`\n${failures.length} failure(s).`);
  process.exitCode = 1;
}
