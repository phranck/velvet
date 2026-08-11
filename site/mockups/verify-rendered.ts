/**
 * The gate that checks what a browser resolved, not what a file contains.
 *
 * Run with `bun ./mockups/verify-rendered.ts` from `site/`, with the dev server
 * running. It complements `verify.ts`, which reads the stylesheets as text.
 *
 * Text searching has three holes, and a review found all three by exploiting
 * them:
 *
 *   1. Twenty tokens drive the strip and the chart and are read through
 *      `getComputedStyle` rather than named in `base.css`. `verify.ts` derives
 *      its required set from `base.css`, so it never asked for them. Deleting
 *      eight of them left every gate green whilst the chart silently fell back
 *      to another theme's values.
 *   2. The literal search stops at a marker comment and there is no closing
 *      one, so anything appended to the end of `base.css` is never checked.
 *   3. A declaration is collected from anywhere in a theme file, including a
 *      selector that matches nothing, so a dead value can be measured whilst
 *      the page renders from something else.
 *
 * All three disappear when the question is asked of the page instead of the
 * file. This gate loads every theme, reads every token back as the browser
 * resolved it, and then swaps one theme's stylesheet for another's in a live
 * document to prove that a switch leaves nothing of the first behind.
 *
 * That last check is the one that matters most in the product: an installation
 * changes its design by changing one file, and a value that survives the change
 * is a page rendering as two designs at once.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.MOCKUP_URL ?? "http://localhost:5173/mockups";

const failures: string[] = [];
const notes: string[] = [];

function fail(gate: string, detail: string): void {
  failures.push(`${gate}: ${detail}`);
}

/**
 * Every token the design layer uses, gathered from all three places that read
 * one, so nothing can be required by the code and unknown to the gate.
 *
 * `base.css` names most of them in `var()`. `read-tokens.ts` names the rest as
 * string literals, because they are resolved in script rather than in CSS, and
 * those are exactly the ones a file-searching gate misses.
 */
function collectTokenNames(): { fromCss: Set<string>; fromScript: Set<string> } {
  const css = readFileSync(join(here, "base.css"), "utf8");
  const fromCss = new Set(
    [...css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((match) => match[1]!),
  );
  const fromScript = new Set<string>();
  // The drawings moved into `@velvet/bundle-plugins`, and the mockups now hand
  // them the same values through `read-tokens.ts`, so every token a drawing
  // needs is still named here as a string literal.
  for (const file of ["read-tokens.ts"]) {
    const source = readFileSync(join(here, file), "utf8");
    for (const match of source.matchAll(/"(--[a-z0-9-]+)"/g)) {
      fromScript.add(match[1]!);
    }
  }
  return { fromCss, fromScript };
}

/**
 * Properties that are set by structure rather than by a theme, or that have a
 * documented fallback. Everything else must resolve to something.
 */
const OPTIONAL = new Set([
  "--status-colour",
  "--series-colour",
  "--strip-surface-height",
  "--notice-cap",
  "--powered-label-tracking",
  "--card-inner-radius",
  "--card-text-inset",
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

/** Reads every named property as the browser resolved it on the root. */
async function resolveAll(page: Page, names: string[]) {
  return page.evaluate((list) => {
    const style = getComputedStyle(
      document.querySelector(".status-page") ?? document.documentElement,
    );
    const out: Record<string, string> = {};
    for (const name of list) out[name] = style.getPropertyValue(name).trim();
    return out;
  }, names);
}

/**
 * The figures that prove a theme actually took effect, read off the rendered
 * page rather than off its stylesheet.
 */
async function measure(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".uptime-strip canvas");
    const card = document.querySelector(".service-card");
    const rail = document.querySelector(".service-rail");
    const body = getComputedStyle(document.body);
    const cardStyle = card ? getComputedStyle(card) : null;
    return {
      background: body.backgroundColor,
      colour: body.color,
      font: body.fontFamily,
      pageWidth: Math.round(
        document.querySelector(".status-band > *")?.getBoundingClientRect().width ?? 0,
      ),
      cardRadius: cardStyle?.borderRadius ?? "",
      cardClip: cardStyle?.clipPath ?? "",
      stripHeight: canvas ? canvas.height : 0,
      railShown: rail ? getComputedStyle(rail).display !== "none" : false,
      chartHeight: document.querySelector(".chart-svg")?.getAttribute("viewBox") ?? "",
    };
  });
}

const themeFiles = readdirSync(join(here, "themes")).filter((file) =>
  file.endsWith(".css"),
);
const themes = themeFiles.map((file) => file.replace(".css", ""));
const { fromCss, fromScript } = collectTokenNames();
const required = [...new Set([...fromCss, ...fromScript])]
  .filter((name) => !OPTIONAL.has(name))
  .sort();

const scriptOnly = [...fromScript].filter((name) => !fromCss.has(name) && !OPTIONAL.has(name));
notes.push(
  `${required.length} tokens required, of which ${scriptOnly.length} are read only in script and invisible to a text search`,
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const fingerprints = new Map<string, Awaited<ReturnType<typeof measure>>>();

// ── Gate A: every token resolves, in every theme, as rendered ───────────────

for (const theme of themes) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${BASE_URL}/${theme}.html`, { waitUntil: "networkidle" });
  await page.click(".service:nth-of-type(1) .service-summary");
  await page.waitForTimeout(400);

  const resolved = await resolveAll(page, required);
  const empty = required.filter((name) => resolved[name] === "");
  if (empty.length > 0) {
    fail("resolved", `${theme}: ${empty.length} token(s) resolve to nothing: ${empty.join(", ")}`);
  }

  fingerprints.set(theme, await measure(page));
  if (errors.length > 0) fail("runtime", `${theme}: ${errors[0]}`);
  page.removeAllListeners("pageerror");
}
if (failures.length === 0) notes.push(`all ${required.length} tokens resolve in all ${themes.length} themes`);

// ── Gate B: no two themes render the same ───────────────────────────────────
// A theme that failed to load would fall back to whatever the browser has, and
// would be indistinguishable from a broken one without this.

for (let i = 0; i < themes.length; i += 1) {
  for (let j = i + 1; j < themes.length; j += 1) {
    const first = fingerprints.get(themes[i]!)!;
    const second = fingerprints.get(themes[j]!)!;
    const same = JSON.stringify(first) === JSON.stringify(second);
    if (same) fail("distinct", `${themes[i]} and ${themes[j]} render identically`);
  }
}
if (!failures.some((f) => f.startsWith("distinct"))) {
  notes.push(`all ${themes.length} themes render distinguishably`);
}

// ── Gate C: switching a theme leaves nothing of the previous one ────────────
//
// The check that matters in the product. An installation changes its design by
// changing one stylesheet, so every token has to take the new value and none
// may keep the old.

for (const from of themes) {
  for (const to of themes) {
    if (from === to) continue;
    await page.goto(`${BASE_URL}/${from}.html`, { waitUntil: "networkidle" });
    const before = await resolveAll(page, required);

    await page.evaluate((next) => {
      const link = [...document.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")].find(
        (candidate) => candidate.href.includes("/themes/"),
      );
      if (!link) throw new Error("no theme stylesheet to swap");
      link.href = `./themes/${next}.css`;
    }, to);
    // The swapped sheet has to load and the fonts it names have to settle
    // before anything is read back.
    await page.waitForTimeout(700);

    const after = await resolveAll(page, required);
    const reference = fingerprints.get(to)!;
    const rendered = await measure(page);

    const stale = required.filter(
      (name) => before[name] !== after[name] === false && before[name] !== after[name],
    );
    // Any token whose value differs between the two themes must have changed.
    const target = await (async () => {
      const other = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await other.goto(`${BASE_URL}/${to}.html`, { waitUntil: "domcontentloaded" });
      const values = await resolveAll(other, required);
      await other.close();
      return values;
    })();

    const wrong = required.filter((name) => after[name] !== target[name]);
    if (wrong.length > 0) {
      fail(
        "switch",
        `${from} to ${to}: ${wrong.length} token(s) kept a value from the old theme: ${wrong.slice(0, 5).join(", ")}`,
      );
    }
    if (rendered.background !== reference.background) {
      fail("switch", `${from} to ${to}: the page background did not follow`);
    }
    void stale;
  }
}
if (!failures.some((f) => f.startsWith("switch"))) {
  notes.push(
    `every one of the ${themes.length * (themes.length - 1)} switches leaves nothing of the previous theme`,
  );
}

await browser.close();

// ── Report ──────────────────────────────────────────────────────────────────

for (const note of notes) console.log(`  ok    ${note}`);
console.log("");
if (failures.length === 0) {
  console.log("All rendered gates passed.");
} else {
  for (const failure of failures) console.log(`  FAIL  ${failure}`);
  console.log(`\n${failures.length} failure(s).`);
  process.exitCode = 1;
}
