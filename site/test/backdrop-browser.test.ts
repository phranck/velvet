import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { webkit } from "playwright";
import { createServer } from "vite";

import { refuseOffsiteRequests } from "./offline.js";
import { createViteTestCache } from "./vite-test-cache.js";

/**
 * Reads back that each surface paints its backdrop into a layer of its own.
 *
 * A background belongs to the paint of the element carrying it, so a backdrop
 * on the body is redrawn by everything that redraws the page. Measured on a
 * status page with the gradients on the body, eight expand-all cycles cost
 * 5809ms of rasterisation, against 485ms with them on a layer and 12ms of
 * layout either way.
 *
 * Read as computed style rather than as source, because what matters is which
 * element ends up carrying the gradients once every stylesheet has had its say,
 * and three of them have an opinion here.
 */

const BROWSER_TIMEOUT_MS = 180_000;

/** The pages that stand on a backdrop. */
const SURFACES = [
  { path: "/onboarding.html", name: "the onboarding", layered: true },
] as const;

test(
  "a backdrop is a layer of its own, never the body's own background",
  async () => {
    const cache = await createViteTestCache("backdrop");
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

    const browser = await webkit.launch();
    try {
      for (const surface of SURFACES) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await refuseOffsiteRequests(page);
        await page.goto(`http://127.0.0.1:${address.port}${surface.path}`);
        await page.waitForTimeout(500);

        const measured = await page.evaluate(() => {
          const body = getComputedStyle(document.body);
          const layer = getComputedStyle(document.body, "::before");
          return {
            bodyImage: body.backgroundImage,
            bodyAttachment: body.backgroundAttachment,
            layerDisplay: layer.display,
            layerPosition: layer.position,
            layerImage: layer.backgroundImage,
            layerZIndex: layer.zIndex,
          };
        });

        assert.equal(
          measured.bodyImage,
          "none",
          `${surface.name} paints its backdrop into the body`,
        );
        assert.doesNotMatch(
          measured.bodyAttachment,
          /fixed/u,
          `${surface.name} still attaches a background to the viewport`,
        );

        if (!surface.layered) {
          assert.equal(
            measured.layerDisplay,
            "none",
            `${surface.name} draws its own surface, so the shared layer must be off`,
          );
          await page.close();
          continue;
        }

        assert.equal(
          measured.layerPosition,
          "fixed",
          `${surface.name} has no fixed backdrop layer`,
        );
        assert.notEqual(
          measured.layerImage,
          "none",
          `${surface.name} has a backdrop layer that paints nothing`,
        );
        assert.equal(
          measured.layerZIndex,
          "-1",
          `${surface.name} puts its backdrop layer in front of its content`,
        );
        await page.close();
      }
    } finally {
      await browser.close();
      await server.close();
      await cache.cleanup();
    }
  },
  BROWSER_TIMEOUT_MS,
);
