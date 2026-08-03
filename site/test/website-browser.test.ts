import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "bun:test";
import { chromium } from "playwright";

import { refuseOffsiteRequests } from "./offline.js";

const execFileAsync = promisify(execFile);
const siteRoot = resolve(import.meta.dirname, "..");
/** A production build plus a browser, on a shared runner. */
const TIMEOUT_MS = 180_000;

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

async function buildWebsite(): Promise<string> {
  const outDir = await mkdtemp(resolve(tmpdir(), "velvet-website-"));
  await execFileAsync(
    process.execPath,
    [
      "run", "--bun", "vite", "build",
      "--config", "vite.website.ts",
      "--outDir", outDir,
      "--emptyOutDir",
    ],
    { cwd: siteRoot, maxBuffer: 64 * 1024 * 1024 },
  );
  return outDir;
}

async function serve(root: string) {
  const server = createServer(async (request, response) => {
    const path = decodeURIComponent((request.url ?? "/").split("?")[0]);
    const file = path === "/" ? "index.html" : path.slice(1);
    try {
      const body = await readFile(join(root, file));
      response.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise<void>((ready) => server.listen(0, ready));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port.");
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
}

test("reserves the showcase band's height before the picture arrives", async () => {
  const site = await serve(await buildWebsite());
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      const measure = async (withoutPicture: boolean) => {
        const page = await browser.newPage({ viewport });
        // Measuring layout against a page that is still fetching from someone
        // else's server measures their latency as much as this layout.
        await refuseOffsiteRequests(page);
        // Blocking the picture outright is the honest form of this test. If the
        // band is the same height either way, the space was reserved rather
        // than taken once the file landed.
        if (withoutPicture) {
          await page.route("**/*.png", (route) => route.abort());
        }
        await page.goto(site.base, { waitUntil: "load" });
        await page.waitForTimeout(400);
        const measured = await page.evaluate(() => {
          const band = document.querySelector(".showcase")!;
          const cards = document.querySelector(
            "section.column[aria-labelledby='capabilities-title']",
          )!;
          return {
            band: Math.round(band.getBoundingClientRect().height),
            cardsTop: Math.round(
              cards.getBoundingClientRect().top + window.scrollY,
            ),
          };
        });
        await page.close();
        return measured;
      };

      const without = await measure(true);
      const withPicture = await measure(false);
      assert.equal(
        withPicture.band,
        without.band,
        `the band reserves its height at ${viewport.width}px`,
      );
      // The consequence, stated separately: everything below the band has to
      // stay where it was. Measured at 208px of movement here before the width
      // moved onto the link.
      assert.equal(
        withPicture.cardsTop,
        without.cardsTop,
        `nothing below the band moves at ${viewport.width}px`,
      );
    }
  } finally {
    await browser.close();
    site.close();
  }
}, TIMEOUT_MS);

test("does not defer a picture that is already on screen", async () => {
  const site = await serve(await buildWebsite());
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await refuseOffsiteRequests(page);
    await page.goto(site.base, { waitUntil: "load" });
    const measured = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>(".showcase img")!;
      const rect = img.getBoundingClientRect();
      return {
        lazy: img.getAttribute("loading") === "lazy",
        onScreen: rect.top < window.innerHeight,
        completeAtLoad: img.complete && img.naturalWidth > 0,
      };
    });

    // The rule, rather than the attribute: a picture inside the first screenful
    // must not be deferred. Marking it lazy makes the browser wait for layout
    // and visibility before it will even ask, which measured 1580ms against
    // 195ms on a throttled connection.
    assert.equal(measured.onScreen, true, "the picture is within the first screenful");
    assert.equal(measured.lazy, false, "a picture on screen is not deferred");
    assert.equal(measured.completeAtLoad, true, "it has arrived by the load event");
    await page.close();
  } finally {
    await browser.close();
    site.close();
  }
}, TIMEOUT_MS);

test("gives both hero buttons the same width", async () => {
  const site = await serve(await buildWebsite());
  const browser = await chromium.launch();
  try {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(site.base, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const measured = await page.evaluate(() => {
        const [first, second] = [
          ...document.querySelectorAll<HTMLElement>(".hero-actions > a"),
        ];
        const a = first!.getBoundingClientRect();
        const b = second!.getBoundingClientRect();
        return {
          first: Math.round(a.width),
          second: Math.round(b.width),
          stacked: Math.round(b.top) > Math.round(a.bottom) - 2,
          overflows: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      assert.equal(
        measured.first,
        measured.second,
        `both buttons are the same width at ${viewport.width}px`,
      );
      // Side by side is only right whilst there is room for it.
      assert.equal(measured.stacked, viewport.width <= 720);
      assert.equal(measured.overflows, false, "no horizontal scrolling");
      await page.close();
    }
  } finally {
    await browser.close();
    site.close();
  }
}, TIMEOUT_MS);
