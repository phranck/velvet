import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "playwright";
import { createServer } from "vite";

import { refuseOffsiteRequests } from "./offline.js";
import { createViteTestCache } from "./vite-test-cache.js";

/**
 * Measures that nothing standing above the status cards is wider than they are.
 *
 * Read as geometry rather than as a stylesheet, because the fault this covers
 * was invisible in the CSS. The notice read the width the page is held to,
 * which looks right and is not: the cards sit one inset inside that width on
 * each side, so anything filling it comes out wider than they do. Only the
 * rendered figures show the difference.
 *
 * The page is mounted with data chosen to show everything at once, because a
 * page that happens to have no incidents and some history renders neither of
 * the things this is about.
 */

const BROWSER_TIMEOUT_MS = 180_000;

/** The default a theme names, and a second one to prove nothing is fixed. */
const CONFIGURED_WIDTHS = ["760px", "1040px"] as const;

test(
  "everything above the cards is exactly as wide as a card",
  async () => {
    const cache = await createViteTestCache("status-page-width");
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

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
      await refuseOffsiteRequests(page);
      // Any page this server builds will do, since what it provides is the
      // module graph. The status page is then mounted on its own beside it.
      await page.goto(`http://127.0.0.1:${address.port}/configurator.html`);
      await page.locator(".status-page").first().waitFor({ timeout: 60_000 });

      const mounted = await page.evaluate(async () => {
        // Addressed as the dev server serves them rather than as modules this
        // file could import, since they are resolved in the page and not here.
        const load = (specifier: string): Promise<Record<string, unknown>> =>
          import(/* @vite-ignore */ specifier);
        const [svelteRuntime, statusPageModule, themeModule] = await Promise.all([
          load("/node_modules/svelte/src/index-client.js"),
          load("/src/components/StatusPage.svelte"),
          load("/src/lib/theme.js"),
        ]);
        const mount = svelteRuntime.mount as (
          component: unknown,
          options: { target: Element; props: Record<string, unknown> },
        ) => unknown;
        const StatusPage = statusPageModule.default;
        const resolveTheme = themeModule.resolveTheme as () => unknown;

        const host = document.createElement("div");
        host.id = "width-probe";
        document.body.append(host);

        // No daily availability at all is what makes the first-run notice
        // appear, and one open incident is what makes the incidents block
        // appear. Both have to be on screen for this to measure anything.
        const service = {
          id: "website",
          name: "Website",
          status: "operational",
          checks: [
            {
              id: "website-ipv4",
              protocol: "ipv4",
              status: "operational",
              checkedAt: "2026-07-27T12:00:00.000Z",
              responseTimeMs: 108,
            },
          ],
          dailyAvailability: [],
        };

        mount(StatusPage, {
          target: host,
          props: {
            config: {
              owner: "example",
              repo: "status",
              dataBranch: "main",
              dataBaseUrl: "https://example.invalid/velvet-data/v1",
              name: "Example",
              logoHeight: 72,
              showPoweredBy: true,
              navbar: [],
              layout: "grouped",
              defaultRange: "month",
              theme: resolveTheme(),
              icons: { website: "ph-globe" },
            },
            statusDocument: {
              schemaVersion: 1,
              generatedAt: "2026-07-27T12:00:00.000Z",
              monitoringStartedAt: "2026-07-27T00:00:00.000Z",
              services: [service],
            },
            responseTimesDocument: {
              schemaVersion: 1,
              generatedAt: "2026-07-27T12:00:00.000Z",
              monitoringStartedAt: "2026-07-27T00:00:00.000Z",
              series: [],
            },
            incidentsDocument: {
              schemaVersion: 1,
              generatedAt: "2026-07-27T12:00:00.000Z",
              events: [
                {
                  id: "incident-1",
                  kind: "incident",
                  state: "open",
                  title: "Website is unavailable",
                  summary: "Checked from GitHub.",
                  startsAt: "2026-07-27T11:00:00.000Z",
                  serviceId: "website",
                  checkId: "website",
                },
              ],
            },
            range: "month",
            openMap: { website: true },
            updated: "Jul 27, 2026, 12:00 PM",
            onSelectRange: () => undefined,
            onToggleAll: () => undefined,
            onToggleService: () => undefined,
          },
        });

        const probe = host.querySelector(".status-page")!;
        return {
          hasNotice: !!probe.querySelector(".first-run"),
          hasIncidents: !!probe.querySelector(".block"),
          hasCard: !!probe.querySelector(":scope > .card"),
        };
      });

      // Without all three on screen this test measures nothing, and a green run
      // would say the widths agree when it never compared any.
      assert.ok(mounted.hasCard, "no service card was rendered");
      assert.ok(mounted.hasNotice, "no first-run notice was rendered");
      assert.ok(mounted.hasIncidents, "no incidents block was rendered");

      for (const configured of CONFIGURED_WIDTHS) {
        const measured = await page.evaluate((width) => {
          const probe = document.querySelector("#width-probe .status-page") as HTMLElement;
          probe.style.setProperty("--service-card-max-width", width);
          const widthOf = (selector: string): number =>
            Number(probe.querySelector(selector)!.getBoundingClientRect().width.toFixed(2));
          return {
            card: widthOf(":scope > .card"),
            notice: widthOf(".first-run"),
            incidents: widthOf(".block"),
          };
        }, configured);

        for (const name of ["notice", "incidents"] as const) {
          assert.equal(
            measured[name],
            measured.card,
            `at a configured ${configured}, ${name} measures ${measured[name]} against a card of ${measured.card}`,
          );
        }
      }
    } finally {
      await browser.close();
      await server.close();
      await cache.cleanup();
    }
  },
  BROWSER_TIMEOUT_MS,
);
