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

/**
 * Composes the card out of the page rather than out of a second design.
 *
 * A preview is read in a glance and is often cropped further by whoever renders
 * it, so it carries the mark and the one sentence that says what Velvet is, and
 * nothing else. The buttons are useless in a picture, and the screenshot band
 * only ever showed a sliver of itself. What stays keeps the page's own type,
 * palette, and board backdrop, because it is the page, restyled for the frame.
 */
const CARD_LAYOUT = `
  /* Everything the card does not say. The bar names pages a reader cannot
     follow from an image, the picture beside the opening column is a second
     subject competing with the first, the keys cannot be pressed, and every
     band below the opening section is a page rather than a card. */
  .band,
  .hero-shot,
  .hero-actions,
  main > section:not(.hero),
  .page-footer {
    display: none !important;
  }
  /* One column, centred, rather than the two the page opens on. The right one
     held the picture that is now hidden, so the left one would otherwise sit
     against the edge with half the card empty beside it. */
  .hero {
    min-height: 100vh;
    padding: 0 !important;
    align-content: center;
  }
  .hero-inner {
    grid-template-columns: 1fr !important;
    justify-items: center;
    gap: 0 !important;
  }
  .hero-text {
    max-width: 52rem;
    text-align: center;
  }
  /* The mark takes its own width from the word it draws, and the scale beneath
     takes its width from the mark, so centring the column is not enough: the
     block has to be centred within it as well. */
  .hero-brand {
    margin-inline: auto;
  }
  /* Larger than the page sets them, because a card is read at a glance and at
     a fraction of the size a browser shows it. */
  .hero-text h1 {
    font-size: 3.25rem !important;
  }
  /* Balanced rather than merely wrapped. The page asks for a pretty wrap, which
     only protects the last line from being left short; in a frame this wide the
     opening sentence still fell as two full lines and two words alone under
     them. A balanced wrap divides it evenly instead, which is what a line of
     type on a card wants and what a paragraph in a column does not. */
  .lead {
    max-width: 50rem;
    margin-inline: auto !important;
    margin-bottom: 0 !important;
    font-size: 1.625rem !important;
    text-wrap: balance !important;
  }
  .status-line {
    justify-content: center;
  }
  /* The light and the rings the page opens in. On the page they fill a tall
     section and reach well past the opening column; in a frame this wide and
     this short they sat mostly outside it, so the card came out flat black
     where the page is lit. Brought in and enlarged, the card is lit the way
     the page is. */
  .hero .orbit {
    inset: -60% -10% !important;
  }
`;

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
    await page.addStyleTag({ content: CARD_LAYOUT });
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
