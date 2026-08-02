/**
 * Render the 1200×630 social card for velvet.li.
 *
 * The card is a photograph of the real page rather than a second design. It
 * serves the built website, sizes the window to the card, and captures what a
 * visitor sees first: the brand, the sentence beneath it, and the way in. That
 * means the card cannot drift from the page, because there is no second copy of
 * the wordmark, the typeface, or the palette to keep in step.
 *
 * The result is committed under the website's `publicDir`, the same arrangement
 * `docs/screenshot.png` uses, so publishing needs no browser. Regenerating it
 * does, hence this script rather than a build step.
 *
 * Requires a prior website build. Run: `bun run --filter @velvet/site website:og`.
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const SITE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BUILT = join(SITE, "dist-website");
const OUT = join(SITE, "src/website/public/og.png");

/** The size every platform crops from, so the card is authored at it directly. */
const CARD = { width: 1200, height: 630 };

const MIME: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function serveBuilt(): Promise<{ base: string; close: () => void }> {
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
    const file = join(BUILT, pathname === "/" ? "index.html" : pathname.slice(1));
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("not found");
    }
  });
  await new Promise<void>((ready) => server.listen(0, ready));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("The card server did not report a port.");
  }
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
}

async function main(): Promise<void> {
  try {
    await stat(join(BUILT, "index.html"));
  } catch {
    throw new Error(
      "No built website found. Run `bun run --filter @velvet/site website:build` first.",
    );
  }

  const site = await serveBuilt();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: CARD,
      // Rendered at the card's own size rather than scaled down from a larger
      // capture, so the type is as sharp as the platforms will show it.
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    await page.goto(site.base, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    // The board backdrop is a background image on the body, and the wordmark
    // needs its face resolved. Neither reports readiness, so the frame is given
    // a moment to settle rather than captured mid-paint.
    await page.waitForTimeout(400);

    const card = await page.screenshot({ type: "png" });
    await writeFile(OUT, card);
    console.log(`velvet: wrote ${OUT} (${(card.length / 1024).toFixed(0)} KB)`);

    // Compressed where the tool is available, which keeps the gradients smooth
    // at a fraction of the size. A missing pngquant is not a failure.
    try {
      execFileSync(
        "pngquant",
        ["--quality=80-96", "--force", "--strip", "--output", OUT, OUT],
        { stdio: "ignore" },
      );
      console.log(
        `velvet: compressed to ${((await stat(OUT)).size / 1024).toFixed(0)} KB`,
      );
    } catch {
      console.log("velvet: pngquant not found, left the card uncompressed");
    }
  } finally {
    await browser.close();
    site.close();
  }
}

await main();
