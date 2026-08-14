import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "playwright";
import { build } from "vite";

import { refuseOffsiteRequests } from "./offline.js";
import { themeStatusPage } from "../vite.theme-page.js";
import { phosphorWoff2Only } from "../vite.static-tool.js";
import { uptimeForRange } from "../src/lib/data.js";
import type { StatusDocument } from "../src/lib/types.js";

/**
 * What an installation that named a theme actually receives.
 *
 * The build is verified against the published page rather than against its own
 * output: the document is read as a reader receives it before any script has
 * run, and then opened in a browser to see whether the theme's own script took
 * over what was published rather than building a second page beside it.
 */

const BROWSER_TIMEOUT_MS = 240_000;
const siteRoot = resolve(import.meta.dirname, "..");
const fixtures = resolve(siteRoot, "../packages/contracts/fixtures/valid");

/** Builds the page the way a published installation receives it. */
async function buildThemePage(
  theme: string,
  themeSettings?: Record<string, string | number | boolean>,
): Promise<{
  outDir: string;
  status: StatusDocument;
  cleanup: () => Promise<void>;
}> {
  const workspace = await mkdtemp(join(tmpdir(), "velvet-theme-"));
  const dataPath = join(workspace, "data");
  const outDir = join(workspace, "dist");
  await mkdir(dataPath, { recursive: true });
  await cp(join(fixtures, "status/dual-stack.json"), join(dataPath, "status.json"));
  await cp(
    join(fixtures, "response-times/with-unavailable.json"),
    join(dataPath, "response-times.json"),
  );
  await cp(join(fixtures, "incidents/incident.json"), join(dataPath, "incidents.json"));

  const configPath = join(workspace, "config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      owner: "example",
      repo: "status",
      name: "Example",
      dataBaseUrl: "./",
      defaultRange: "month",
      theme,
      ...(themeSettings ? { themeSettings } : {}),
      serial: 42,
    }),
  );

  await build({
    root: siteRoot,
    configFile: false,
    logLevel: "silent",
    base: "./",
    plugins: [
      phosphorWoff2Only,
      svelte(),
      themeStatusPage({ root: siteRoot, configPath, dataPath, theme }),
    ],
    build: { outDir, emptyOutDir: true },
  });

  return {
    outDir,
    status: JSON.parse(
      await readFile(join(dataPath, "status.json"), "utf8"),
    ) as StatusDocument,
    cleanup: () => rm(workspace, { recursive: true, force: true }),
  };
}

test(
  "publishes the named theme, in its own colours, working without the component page",
  async () => {
    const built = await buildThemePage("velvet");
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        const file = Bun.file(join(built.outDir, path === "/" ? "index.html" : path));
        return (await file.exists())
          ? new Response(file)
          : new Response(null, { status: 404 });
      },
    });

    const browser = await chromium.launch();
    try {
      const published = await readFile(join(built.outDir, "index.html"), "utf8");

      // What a reader receives before a single script has run. A status page is
      // opened when something is already broken, often over a connection that
      // is part of what is broken.
      assert.match(published, /class="velvet-page"/);
      for (const service of built.status.services) {
        assert.ok(
          published.includes(service.name),
          `the published document names ${service.name}`,
        );
        const figure = uptimeForRange(
          service,
          "month",
          built.status.generatedAt,
          built.status.monitoringStartedAt,
        );
        assert.ok(
          published.includes(figure),
          `the published document carries ${service.name}'s uptime of ${figure}`,
        );
      }

      // A theme carries its own appearance: the page links its stylesheet, and
      // the only properties written into the document are the ones its own
      // manifest declares as settings.
      assert.match(published, /<link rel="stylesheet"[^>]*href="[^"]*\.css"/);
      const declared = [
        ...(published.match(/--[a-z-]+(?=:)/gu) ?? []),
      ].filter((property) => published.includes(`<style>:root { ${property}`));
      assert.deepEqual(declared, ["--chart-area-display"]);

      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await refuseOffsiteRequests(page);
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));

      await page.goto(`http://127.0.0.1:${server.port}/`);
      await page.locator(".velvet-page").first().waitFor();

      // One page, not the published one with a second built beside it.
      assert.equal(await page.locator(".velvet-page").count(), 1);

      // The theme's script took over: a range the page was not published in
      // rewrites every figure, and it does so from the data in the document
      // rather than by fetching anything.
      const first = built.status.services[0]!;
      const figure = page.locator(
        `.service[data-service-id="${first.id}"] .service-uptime`,
      );
      const before = await figure.textContent();
      await page.locator('.range-button[data-range="quarter"]').click();
      const after = await figure.textContent();
      assert.equal(
        after?.includes(
          uptimeForRange(
            first,
            "quarter",
            built.status.generatedAt,
            built.status.monitoringStartedAt,
          ),
        ),
        true,
        `after switching to 7d the figure reads ${after}, and read ${before} before`,
      );

      assert.deepEqual(failures, []);
      await page.close();
    } finally {
      await browser.close();
      await server.stop(true);
      await built.cleanup();
    }
  },
  BROWSER_TIMEOUT_MS,
);

test(
  "publishes what was set on the theme, and what was not",
  async () => {
    const off = await buildThemePage("velvet", { chartWash: false });
    const browser = await chromium.launch();
    try {
      // Written whether or not anybody set it, so a theme reads one answer
      // rather than a value in the document and a fallback in its stylesheet.
      const html = await readFile(join(off.outDir, "index.html"), "utf8");
      assert.match(html, /--chart-area-display: none;/);

      const page = await browser.newPage();
      await refuseOffsiteRequests(page);
      await page.goto(pathToFileURL(join(off.outDir, "index.html")).href);
      // In force on the page rather than merely present in the document, which
      // is what the theme's own `var()` reads.
      const inForce = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--chart-area-display")
          .trim(),
      );
      assert.equal(inForce, "none");
      await page.close();
    } finally {
      await browser.close();
      await off.cleanup();
    }

    const on = await buildThemePage("velvet");
    try {
      const html = await readFile(join(on.outDir, "index.html"), "utf8");
      assert.match(html, /--chart-area-display: block;/);
    } finally {
      await on.cleanup();
    }
  },
  BROWSER_TIMEOUT_MS,
);

test(
  "stops the build rather than publishing a setting the theme cannot take",
  async () => {
    await assert.rejects(
      buildThemePage("velvet", { chartWash: "sometimes" }),
      /must be true or false/,
    );
    await assert.rejects(
      buildThemePage("velvet", { chartWish: true }),
      /no setting called "chartWish"/,
    );
  },
  BROWSER_TIMEOUT_MS,
);

test(
  "stops the build rather than publishing a theme nobody asked for",
  async () => {
    await assert.rejects(
      buildThemePage("no-such-theme"),
      /there is no theme called "no-such-theme"/,
    );
  },
  BROWSER_TIMEOUT_MS,
);

/**
 * Retro Chassis prints its readings on a lattice of unlit dots, and a reading that
 * does not stand on that lattice is the one fault in the panel a reader sees
 * immediately and no figure in the stylesheet reports.
 *
 * The panel is built entirely of whole cells: its width is rounded down to one,
 * each line is rounded down again, and every character advances by exactly one.
 * Anything else on a line has to be a whole number of cells as well, which is
 * what the gap between two readings kept getting wrong: the page's own row step
 * is 12px against a cell of 14, so the figure at the end of the first line sat
 * two pixels short of a column for the whole width of the panel.
 *
 * The widths below are chosen because the fault only shows whilst the line is
 * tight enough that the figure is not pushed flush against the trailing edge,
 * which lands on a column whatever the gap is. Measured on the ordinary
 * fixture, that is every page measure from 316px to 510px.
 */
test(
  "every reading on the readout starts on a column of its lattice",
  async () => {
    const built = await buildThemePage("retro-chassis");
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        const file = Bun.file(join(built.outDir, path === "/" ? "index.html" : path));
        return (await file.exists())
          ? new Response(file)
          : new Response(null, { status: 404 });
      },
    });

    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await refuseOffsiteRequests(page);
      await page.goto(`http://127.0.0.1:${server.port}/`);
      await page.locator(".retro-chassis-page").first().waitFor();
      await page.evaluate(() => document.fonts.ready);

      for (const width of [520, 640, 900, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(60);
        const off = await page.evaluate(() => {
          const cell = Number.parseFloat(
            getComputedStyle(
              document.querySelector(".service-display")!,
            ).getPropertyValue("--service-display-cell-advance"),
          );
          const inkLeft = (element: Element): number => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return range.getBoundingClientRect().left;
          };
          const wrong: Array<{ text: string; short: number }> = [];
          for (const line of document.querySelectorAll(".service-display-line")) {
            const left = line.getBoundingClientRect().left;
            if (line.getBoundingClientRect().width < cell) continue;
            const readings = line.querySelector(".service-display-main")
              ? [...line.children]
              : [line];
            for (const reading of readings) {
              if (!reading.textContent?.trim()) continue;
              const short = (((inkLeft(reading) - left) % cell) + cell) % cell;
              if (short > 0.05) {
                wrong.push({ text: reading.textContent.trim().slice(0, 20), short });
              }
            }
          }
          return { cell, wrong };
        });
        assert.deepEqual(
          off.wrong,
          [],
          `at ${width}px the readout stands off its ${off.cell}px lattice`,
        );
      }

      await page.close();
    } finally {
      await browser.close();
      await server.stop(true);
      await built.cleanup();
    }
  },
  BROWSER_TIMEOUT_MS,
);
