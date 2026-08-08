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
 * Reads back that a link asks the pointer to become a hand.
 *
 * Driven in WebKit as well as in Chromium, because the two engines supply
 * different defaults for a link that states nothing: Chromium's own stylesheet
 * gives `pointer` and WebKit's gives `auto`, which leaves the shape to the
 * engine and draws the arrow. A page that says nothing therefore looks correct
 * in one browser and wrong in the other, and only the browser that reads `auto`
 * can show that the page never said anything.
 *
 * The rule lives in `src/lib/velvet-tokens.css`, which every surface loads. It
 * lived in `src/app.css` until 2026-08-08, which only the status page loads, so
 * velvet.li, the Configurator and the onboarding all drew the arrow whilst this
 * test stayed green: it drives a dev server, where `app.css` reaches the module
 * graph regardless, and the production build of those pages never included it.
 *
 * That is why the file the rule sits in is asserted below as well as the
 * behaviour. A browser check against a dev server proves what the dev server
 * serves, and the two are not the same document.
 */

const BROWSER_TIMEOUT_MS = 240_000;

/** Pages carrying links, one from the site and one from a board-backed tool. */
const PAGES = ["/website.html", "/onboarding.html"] as const;

test("states the hand where every surface reads it, not in one surface's own stylesheet", async () => {
  // The defect this guards was invisible to the browser check below, because a
  // dev server resolves stylesheets the production build does not include.
  const shared = await readFile(
    resolve(import.meta.dirname, "../src/lib/velvet-tokens.css"),
    "utf8",
  );
  assert.match(shared, /a\[href\]\s*\{[^}]*cursor:\s*pointer/s);

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
  "every link states the hand, in WebKit as well as in Chromium",
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
          // link in document order belongs to a later step on the onboarding
          // and never becomes visible at all.
          await page.waitForFunction(
            () =>
              [...document.querySelectorAll("a[href]")].some((link) => {
                const box = link.getBoundingClientRect();
                return box.width > 0 && box.height > 0;
              }),
            undefined,
            { timeout: 60_000 },
          );

          const measured = await page.evaluate(() =>
            [...document.querySelectorAll("a[href]")]
              .filter((link) => {
                const box = link.getBoundingClientRect();
                return box.width > 0 && box.height > 0;
              })
              .map((link) => ({
                label:
                  (link.textContent ?? "").trim().slice(0, 30) ||
                  link.getAttribute("href") ||
                  "(no text)",
                cursor: getComputedStyle(link).cursor,
              })),
          );

          // A page whose links never rendered would pass every assertion below
          // whilst comparing nothing at all.
          assert.ok(
            measured.length > 0,
            `${path} rendered no visible link in ${engineName}`,
          );

          for (const link of measured) {
            assert.equal(
              link.cursor,
              "pointer",
              `in ${engineName}, ${path} leaves "${link.label}" at ${link.cursor}`,
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
