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
 * The preview reaches the card's own edge, and the corner it meets there is cut
 * by the card body's squircle path rather than drawn by a border radius. A
 * wrong shape looks almost right, which is why this is measured instead of
 * looked at.
 */
function readGeometry() {
  const card = document.querySelector("[data-reference-list] li > *");
  const image = document.querySelector("[data-reference-list] img");
  if (!card || !image) return null;
  const style = getComputedStyle(card);
  const padding = Number.parseFloat(style.padding);
  const name = document.querySelector("[data-reference-entry] .reference-name");
  const frame = document.querySelector("[data-reference-entry] .preview-frame");
  const body = document.querySelector(
    "[data-reference-entry] .reference-card-body",
  );
  return {
    frameWidth: frame ? Math.round(frame.getBoundingClientRect().width) : 0,
    bodyClip: body ? getComputedStyle(body).clipPath : "",
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
    assert.equal(chips.length, 3, "services, release, and uptime");
    const unit = String.raw`\d+ (?:years?|months?|weeks?|days?)`;
    assert.match(
      chips[2]?.title ?? "",
      new RegExp(`^${unit}(?:, ${unit})*$`, "u"),
      `the uptime chip carries no breakdown, only ${JSON.stringify(chips[2])}`,
    );
    // The point of the hover is that it says more than the chip does.
    assert.notEqual(chips[2]?.title, chips[2]?.text);

    // The state is a lamp on the preview, and a colour on its own says nothing
    // until a reader has been told what it means, so the legend states each one
    // above the cards.
    const legend = await page.$$eval(
      "[data-reference-legend] .legend-item",
      readChips,
    );
    assert.deepEqual(
      legend.map((item) => item.text),
      ["All operational", "Degraded", "Outage", "No data yet"],
    );
    // On the site's own card, centred, so it reads as belonging to the gallery
    // beneath it rather than to the paragraph above.
    const legendBox = await page.evaluate(() => {
      const list = document.querySelector("[data-reference-legend]");
      const card = document.querySelector(".legend-card > *");
      if (!list || !card) return null;
      const listBox = list.getBoundingClientRect();
      const cardBox = card.getBoundingClientRect();
      const items = [...list.children].map((item) => item.getBoundingClientRect());
      return {
        onCard: getComputedStyle(card).backgroundColor,
        leftGap: Math.round(items[0].left - listBox.left),
        rightGap: Math.round(listBox.right - items[items.length - 1].right),
        cardWidth: Math.round(cardBox.width),
      };
    });
    assert.ok(legendBox);
    // Centred is one number against another rather than something to look at:
    // the room left of the first item equals the room right of the last.
    assert.ok(
      Math.abs(legendBox.leftGap - legendBox.rightGap) <= 1,
      `the legend sits ${legendBox.leftGap}px from one edge and ${legendBox.rightGap}px from the other`,
    );
    const lamp = await page.$eval("[data-reference-entry] .led", (node) => ({
      title: node.getAttribute("title"),
      colour: getComputedStyle(node).backgroundColor,
      glow: getComputedStyle(node).boxShadow,
    }));
    assert.equal(lamp.title, "All operational");
    // The same colour the legend names for that state, so the two agree.
    assert.equal(lamp.colour, "rgb(46, 160, 67)");
    assert.match(lamp.glow, /rgb/u);

    const geometry = await page.evaluate(readGeometry);

    assert.ok(geometry);
    // The preview reaches the card's own edge rather than sitting inside its
    // padding, so it is as wide as the card and is cut by the corner rather
    // than stopping short of it.
    assert.equal(geometry.frameWidth, geometry.cardWidth);
    // What forms that corner is the card body's squircle path, built from the
    // card's own measured size. A border radius here would be the rounded
    // corner the squircle replaced, and the two part company most visibly at
    // exactly this edge.
    //
    // The shape is drawn as a closed polyline of 64 segments rather than with
    // curve commands, so what proves it is a squircle rather than a rectangle
    // is how many points it has: four would be a box.
    assert.match(geometry.bodyClip, /^path\(/u);
    assert.ok(
      (geometry.bodyClip.match(/L/gu) ?? []).length > 32,
      `the card body is clipped to ${geometry.bodyClip.slice(0, 80)}`,
    );
    // One entry occupies one cell of the grid rather than a row the width of
    // the page, which is what a full-width row got wrong.
    assert.ok(
      geometry.cardWidth < 700,
      `a single entry spans ${geometry.cardWidth}px of the measure`,
    );
    // At rest the card casts nothing, because what draws its edge is the
    // squircle outline rather than a shadow under a rounded box.
    assert.equal(
      (geometry.shadow.match(/rgba?\(/gu) ?? []).length,
      0,
      `the card carries ${geometry.shadow} before anybody points at it`,
    );
    // Pointing at one lifts it, and that lift is two layers: one wide shadow
    // dissolves into the board backdrop these pages sit on and leaves the card
    // looking pasted flat, so the near layer draws its edge and the far one
    // carries the height.
    await page.hover("[data-reference-entry]");
    const raised = await page.evaluate(() => {
      const body = document.querySelector(
        "[data-reference-entry] .reference-card-body",
      );
      return body ? getComputedStyle(body).boxShadow : "";
    });
    assert.equal(
      (raised.match(/rgba?\(/gu) ?? []).length,
      2,
      `a pointed-at card carries ${raised}`,
    );
    // The condensed face, as the site sets every name that titles something.
    assert.match(geometry.nameFont, /Barlow Condensed/u);
  } finally {
    await browser.close();
    site.close();
  }
}, TIMEOUT_MS);
