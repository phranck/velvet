import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "playwright";
import { createServer } from "vite";

import { refuseOffsiteRequests } from "./offline.js";
import { createViteTestCache } from "./vite-test-cache.js";

/** Five documents, one browser, and a dependency-optimisation pass. */
const TIMEOUT_MS = 180_000;

/**
 * The pages that draw a card without being given anything first.
 *
 * The references page draws one per consenting installation and reads that list
 * from the setup service, which this harness refuses along with every other
 * off-machine request, so it has nothing to draw here. It uses the same
 * component, which `module-graph` records.
 */
const PAGES = [
  "website.html",
  "documentation.html",
  "changelog.html",
  "attributions.html",
];

test("draws every card on one surface, and none of them with a border", async () => {
  const cache = await createViteTestCache("card-surface");
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
  const base = `http://127.0.0.1:${address.port}`;

  const browser = await chromium.launch();
  const surfaces: { page: string; radius: string; padding: string; background: string }[] = [];
  try {
    for (const document_ of PAGES) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await refuseOffsiteRequests(page);
      await page.goto(`${base}/${document_}`, { waitUntil: "load" });
      const measured = await page.evaluate(() => {
        // Everything that reads as a card: the shared component, and the step
        // card the start page draws. A page that grew a fifth kind of card
        // would be caught by the surfaces not matching rather than by this
        // list, which is why the list stays short.
        const cards = [
          ...document.querySelectorAll("[data-step-card], .card"),
        ];
        return cards.map((card) => {
          const style = getComputedStyle(card);
          return {
            radius: style.borderTopLeftRadius,
            padding: style.padding,
            background: style.backgroundColor,
            border: [
              style.borderTopWidth,
              style.borderRightWidth,
              style.borderBottomWidth,
              style.borderLeftWidth,
            ],
          };
        });
      });
      await page.close();

      assert.ok(measured.length > 0, `${document_} draws no card`);
      for (const card of measured) {
        // The reported symptom. A card is separated from the backdrop by its
        // surface, and a rule around it draws a second edge just inside the
        // first, which is why the start page's never had one and why every
        // other page's did.
        assert.deepEqual(
          card.border,
          ["0px", "0px", "0px", "0px"],
          `a card on ${document_} draws a border`,
        );
      }
      surfaces.push({ page: document_, ...measured[0] });
    }

    // One geometry. Four pages wrote their own before, each with its own copy
    // of it, and keeping four copies in step by hand is what let the border
    // survive on three of them.
    //
    // The surface itself is not compared. The start page's card sits over the
    // board backdrop and is translucent so that backdrop keeps showing through,
    // whilst a page of prose is read on a solid one. That is a difference in
    // what the two stand on rather than two ideas of what a card is.
    const [reference, ...rest] = surfaces;
    for (const surface of rest) {
      assert.equal(
        surface.radius,
        reference.radius,
        `${surface.page} rounds its cards differently from ${reference.page}`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
    await cache.cleanup();
  }
}, TIMEOUT_MS);
