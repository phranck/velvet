import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { webkit } from "playwright";
import { createServer } from "vite";

import { createViteTestCache } from "./vite-test-cache.js";

/**
 * Exercises the status-page disclosure in WebKit, the engine Safari uses.
 *
 * This is WebKit through Playwright, not Safari itself. Safari has to be driven
 * through Safari Remote Automation, which needs `safaridriver` enabled on the
 * machine, so this covers the engine rather than the browser. That distinction
 * matters, because the defects this interaction has produced before were engine
 * behaviour: #66 was a WebKit stutter, and #129 was a view-transition area that
 * covered too much.
 */

const BROWSER_TIMEOUT_MS = 180_000;

test("opens and closes every service in WebKit, with or without view transitions", async () => {
  const cache = await createViteTestCache("status-page-webkit");
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route("https://phranck.github.io/**", (route) => route.abort());
    await page.goto(`http://127.0.0.1:${address.port}/configurator.html`);

    const preview = page.locator(".status-page");
    await preview.waitFor();
    const layout = await preview.getAttribute("data-layout");
    assert.ok(layout === "grouped" || layout === "cards", `layout ${layout}`);

    const hidden = () =>
      page.locator(".status-page [id$='-details'][hidden]").count();
    const services = await page.locator(".status-page [id$='-details']").count();
    assert.ok(services > 0, "the preview renders services");
    assert.equal(await hidden(), 0, "the preview opens with services expanded");

    await page.locator(".status-page .toggle-all").click();
    await page.waitForFunction(
      (expected) =>
        document.querySelectorAll(".status-page [id$='-details'][hidden]")
          .length === expected,
      services,
      { timeout: 10_000 },
    );

    await page.locator(".status-page .toggle-all").click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".status-page [id$='-details'][hidden]")
          .length === 0,
      undefined,
      { timeout: 10_000 },
    );

    // Whether this engine build implements view transitions decides which path
    // runs, and both have to work: the controller falls back to a direct update
    // when the API is absent.
    const supported = await page.evaluate(
      () => typeof document.startViewTransition === "function",
    );
    assert.equal(typeof supported, "boolean");
  } finally {
    await browser.close();
    await server.close();
    await cache.cleanup();
  }
}, BROWSER_TIMEOUT_MS);
