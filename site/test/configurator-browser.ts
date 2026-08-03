import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

import { refuseOffsiteRequests } from "./offline.js";
import { createViteTestCache } from "./vite-test-cache.js";

/**
 * One dev server and one browser for every Configurator test in a file.
 *
 * Sharing them is not only faster. Two Vite servers optimising the same
 * dependency graph at once starve each other so badly that the second one
 * looks like a hung test rather than a slow one, which is what happened when
 * each test started its own.
 */
export interface ConfiguratorHarness {
  /** A fresh page with the theme registry stubbed out, since no test is about it. */
  newPage(): Promise<Page>;
  /** Navigates to the Configurator and expands one sidebar section. */
  openSection(page: Page, section: string): Promise<void>;
  close(): Promise<void>;
}

export async function createConfiguratorHarness(
  label: string,
): Promise<ConfiguratorHarness> {
  const cache = await createViteTestCache(label);
  const server: ViteDevServer = await createServer({
    root: resolve(import.meta.dirname, ".."),
    cacheDir: cache.path,
    configFile: false,
    logLevel: "silent",
    plugins: [svelte()],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Missing Vite port.");
  }
  const origin = `http://127.0.0.1:${address.port}`;
  const browser: Browser = await chromium.launch();

  return {
    async newPage() {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      // Confined to the dev server, which covers the theme registry this page
      // would otherwise fetch and anything else added to it later.
      await refuseOffsiteRequests(page);
      return page;
    },

    async openSection(page, section) {
      await page.goto(`${origin}/configurator.html`);
      // A first visit collapses every section, which is what a reader sees.
      await page
        .locator(`[data-configurator-section="${section}"] summary`)
        .click();
      await page
        .locator(
          `[data-configurator-section="${section}"][data-section-expanded="true"]`,
        )
        .waitFor();
    },

    async close() {
      await browser.close();
      await server.close();
      await cache.cleanup();
    },
  };
}
