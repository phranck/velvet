import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";

import { readFile } from "node:fs/promises";

import { refuseOffsiteRequests } from "./offline.js";
import { createViteTestCache } from "./vite-test-cache.js";

/**
 * Reads back that everything pressable asks the pointer to become a hand.
 *
 * Driven in WebKit as well as in Chromium, because the two engines supply
 * different defaults for a control that states nothing: Chromium's own
 * stylesheet gives a link `pointer` and WebKit's gives it `auto`, which leaves
 * the shape to the engine and draws the arrow. A page that says nothing
 * therefore looks correct in one browser and wrong in the other, and only the
 * browser that reads `auto` can show that the page never said anything.
 *
 * Two things are asserted rather than one, and each covers a way the other can
 * pass whilst the product is wrong.
 *
 * The file the rule sits in is asserted, because this drives a dev server and a
 * dev server resolves stylesheets a production build does not include. A rule
 * in one surface's own stylesheet therefore reads as correct here and ships
 * only to that surface.
 *
 * Every kind of control is measured rather than links alone, because a rule
 * naming one element type leaves every other control to the engine, and that is
 * invisible to a check that only ever looks at links.
 */

const BROWSER_TIMEOUT_MS = 240_000;

/**
 * The pages measured: the site, and the two board-backed tools.
 *
 * The Configurator earns its place by carrying the checkboxes and radios, which
 * are the controls a link-only rule leaves behind.
 */
const PAGES = ["/website.html", "/onboarding.html", "/configurator.html"] as const;

/**
 * What Velvet treats as pressable.
 *
 * A label is in here only where it carries a checkbox or a radio, because
 * pressing one of those is what the label does. A label in front of a text
 * field puts the caret in the field, and the arrow is right there.
 */
const PRESSABLE = [
  "a[href]",
  "summary",
  "button:not(:disabled)",
  '[role="button"]:not([aria-disabled="true"])',
  'input:is([type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"]):not(:disabled)',
  'label:has(input:is([type="checkbox"], [type="radio"]):not(:disabled))',
].join(",");

test("states the hand for every control, where every surface reads it", async () => {
  const shared = await readFile(
    resolve(import.meta.dirname, "../src/lib/velvet-tokens.css"),
    "utf8",
  );

  // Each kind named in the one rule. A control the rule does not name is one
  // that depends on somebody having declared the cursor beside it, which is
  // what left the Configurator's checkboxes and radios drawing the arrow. #454.
  for (const control of [
    "a\\[href\\]",
    "summary",
    "button:not\\(:disabled\\)",
    'input:is\\(\\s*\\[type="checkbox"\\]',
    "label:has\\(",
  ]) {
    assert.match(
      shared,
      new RegExp(`${control}[\\s\\S]*?cursor:\\s*pointer`),
      `the shared rule names no ${control}, so that control takes the engine's default`,
    );
  }

  // A surface stating it for itself is how the other surfaces go without, and
  // the browser check below cannot see that, because a dev server serves what a
  // production build leaves out.
  for (const surface of ["app.css", "website/website.css"]) {
    const source = await readFile(
      resolve(import.meta.dirname, "../src", surface),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /a\[href\]\s*\{[^}]*cursor:\s*pointer/s,
      `${surface} states the cursor itself, so the other surfaces go without`,
    );
  }
});

test(
  "every pressable control draws the hand, in WebKit as well as in Chromium",
  async () => {
    const cache = await createViteTestCache("link-cursor");
    const server = await createServer({
      root: resolve(import.meta.dirname, ".."),
      cacheDir: cache.path,
      configFile: false,
      logLevel: "silent",
      plugins: [svelte()],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("Missing Vite port.");

    for (const [engineName, engine] of [
      ["webkit", webkit],
      ["chromium", chromium],
    ] as const) {
      const browser = await engine.launch();
      try {
        for (const path of PAGES) {
          const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
          await refuseOffsiteRequests(page);
          await page.goto(`http://127.0.0.1:${address.port}${path}`);
          // Waited for by measuring rather than by locator, because the first
          // control in document order belongs to a later step on the onboarding
          // and never becomes visible at all.
          await page.waitForFunction(
            (selector: string) =>
              [...document.querySelectorAll(selector)].some((node) => {
                const box = node.getBoundingClientRect();
                return box.width > 0 && box.height > 0;
              }),
            PRESSABLE,
            { timeout: 60_000 },
          );

          const measured = await page.evaluate(
            (selector: string) =>
              [...document.querySelectorAll(selector)]
                .filter((node) => {
                  const box = node.getBoundingClientRect();
                  return box.width > 0 && box.height > 0;
                })
                .map((node) => ({
                  label:
                    (node.textContent ?? "").trim().slice(0, 30) ||
                    node.getAttribute("href") ||
                    `${node.tagName.toLowerCase()}[${node.getAttribute("type") ?? ""}]`,
                  cursor: getComputedStyle(node).cursor,
                })),
            PRESSABLE,
          );

          // A page whose controls never rendered would pass every assertion
          // below whilst comparing nothing at all.
          assert.ok(
            measured.length > 0,
            `${path} rendered no visible control in ${engineName}`,
          );

          for (const control of measured) {
            assert.equal(
              control.cursor,
              "pointer",
              `in ${engineName}, ${path} leaves "${control.label}" at ${control.cursor}`,
            );
          }

          await page.close();
        }
      } finally {
        await browser.close();
      }
    }

    await server.close();
    await cache.cleanup();
  },
  BROWSER_TIMEOUT_MS,
);
