import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "bun:test";
import { chromium } from "playwright";

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
  ".woff2": "font/woff2",
};

/**
 * Builds the gallery the way the site publishes it.
 *
 * The published page is what has to be driven, because it is the one that runs
 * the script that reads each installation.
 */
async function buildReferences(): Promise<string> {
  const outDir = await mkdtemp(resolve(tmpdir(), "velvet-references-"));
  await execFileAsync(
    process.execPath,
    [
      "run", "--bun", "vite", "build",
      "--config", "vite.references.ts",
      "--outDir", outDir,
      "--emptyOutDir",
    ],
    { cwd: siteRoot, maxBuffer: 64 * 1024 * 1024 },
  );
  return outDir;
}

/** Serves a built directory over loopback. */
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
  return { base: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}

/** A one-pixel PNG, so a preview is served without a fixture on disc. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const LIVE = "https://live.example.com/";
const GONE = "https://gone.example.com/";

/** Reads the rendered entries out of the page. */
function readEntries(nodes: Element[]) {
  return nodes.map((node) => ({
    text: (node.textContent ?? "").replace(/\s+/gu, " ").trim(),
    href: node.getAttribute("href"),
    image: node.querySelector("img")?.getAttribute("src") ?? null,
    loading: node.querySelector("img")?.getAttribute("loading") ?? null,
  }));
}

/** Reads each fact chip and whatever it carries on hover. */
function readChips(nodes: Element[]) {
  return nodes.map((node) => ({
    text: (node.textContent ?? "").replace(/\s+/gu, " ").trim(),
    title: node.getAttribute("title"),
  }));
}

/**
 * Reads the card and its preview back as numbers.
 *
 * The preview runs the full width of the card's content box, so it takes the
 * inner radius rather than the outer one. A wrong radius there looks almost
 * right, which is why this is measured instead of looked at.
 */
function readGeometry() {
  const card = document.querySelector("[data-reference-list] li > *");
  const image = document.querySelector("[data-reference-list] img");
  if (!card || !image) return null;
  const style = getComputedStyle(card);
  const padding = Number.parseFloat(style.padding);
  const name = document.querySelector("[data-reference-entry] .reference-name");
  return {
    cardWidth: Math.round(card.getBoundingClientRect().width),
    imageWidth: Math.round(image.getBoundingClientRect().width),
    contentWidth: Math.round(card.getBoundingClientRect().width - 2 * padding),
    imageRadius: Number.parseFloat(getComputedStyle(image).borderRadius),
    expectedRadius: Number.parseFloat(style.borderRadius) - padding,
    shadow: style.boxShadow,
    nameFont: name ? getComputedStyle(name).fontFamily : "",
  };
}

test("shows each installation as its own page, and leaves out one that has gone", async () => {
  const site = await serve(await buildReferences());
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.route("**/api/references", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            { statusPageName: "Live Status", url: LIVE },
            { statusPageName: "Gone Status", url: GONE },
          ],
        }),
      }),
    );
    await page.route(`${LIVE}config.json`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          dataBaseUrl: "https://data.example.com/v1",
          theme: { grid: { operational: "#2ea043" } },
        }),
      }),
    );
    await page.route("https://data.example.com/v1/status.json", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          monitoringStartedAt: "2026-01-05T08:00:00.000Z",
          services: [{ status: "operational" }, { status: "operational" }],
        }),
      }),
    );
    await page.route(`${LIVE}og.png`, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }),
    );
    // Its repository still consents, so the service still lists it, but the
    // page itself is gone.
    await page.route(`${GONE}**`, (route) => route.fulfill({ status: 404 }));

    await page.goto(site.base, { waitUntil: "load" });
    await page.waitForSelector("[data-reference-entry]");

    const entries = await page.$$eval("[data-reference-entry]", readEntries);

    assert.equal(entries.length, 1, "an installation whose page has gone is left out");
    assert.equal(entries[0]?.href, LIVE);
    assert.match(entries[0]?.text ?? "", /Live Status/u);
    assert.match(entries[0]?.text ?? "", /live\.example\.com/u);
    assert.match(entries[0]?.text ?? "", /All operational/u);
    assert.match(entries[0]?.text ?? "", /2 services/u);
    assert.match(entries[0]?.text ?? "", /Release: 05\.01\.2026/u);
    assert.match(entries[0]?.text ?? "", /Uptime: \d+ days/u);
    assert.equal(entries[0]?.image, `${LIVE}og.png`);
    // A gallery is otherwise a page of large pictures fetched before any of
    // them is on screen.
    assert.equal(entries[0]?.loading, "lazy");

    // Each fact is its own chip, so two cards can be compared a fact at a time.
    // The exact span is on the uptime chip rather than in it.
    const chips = await page.$$eval("[data-reference-entry] .fact", readChips);
    assert.equal(chips.length, 4, "state, services, release, and uptime");
    const unit = String.raw`\d+ (?:years?|months?|weeks?|days?)`;
    assert.match(
      chips[3]?.title ?? "",
      new RegExp(`^${unit}(?:, ${unit})*$`, "u"),
      `the uptime chip carries no breakdown, only ${JSON.stringify(chips[3])}`,
    );
    // The point of the hover is that it says more than the chip does.
    assert.notEqual(chips[3]?.title, chips[3]?.text);

    const geometry = await page.evaluate(readGeometry);

    assert.ok(geometry);
    assert.equal(geometry.imageWidth, geometry.contentWidth);
    assert.equal(geometry.imageRadius, geometry.expectedRadius);
    // One entry occupies one cell of the grid rather than a row the width of
    // the page, which is what a full-width row got wrong.
    assert.ok(
      geometry.cardWidth < 700,
      `a single entry spans ${geometry.cardWidth}px of the measure`,
    );
    // Two layers, because one wide shadow dissolves into the board backdrop
    // these pages sit on and leaves the card looking pasted flat.
    assert.equal(
      (geometry.shadow.match(/rgba?\(/gu) ?? []).length,
      2,
      `the card carries ${geometry.shadow}`,
    );
    // The condensed face, as the site sets every name that titles something.
    assert.match(geometry.nameFont, /Barlow Condensed/u);
  } finally {
    await browser.close();
    site.close();
  }
}, TIMEOUT_MS);
