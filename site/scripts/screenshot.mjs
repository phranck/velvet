/**
 * Regenerate the README screenshot from a demo status page.
 *
 * This drives the real Velvet pipeline end to end, so it doubles as a smoke
 * test:
 *   1. run `generate-config.mjs` on `demo/velvet.yml`, which is the step an
 *      installation's own `velvet.yml` runs,
 *   2. build the page from that configuration and the contract-valid demo
 *      documents in `demo/fixtures.mjs`, which is what the Action does,
 *   3. serve the build and render it in headless Chromium with the clock frozen
 *      so the result is byte-stable,
 *   4. frame the page on a gradient (rounded corners + shadow),
 *   5. write `docs/screenshot.png`.
 *
 * The page fetches nothing: it is published in a theme, and a theme is rendered
 * at build time from documents the build was given. What used to be checked by
 * intercepting three requests is therefore checked by reading the page.
 *
 * Run: `bun run screenshot`.
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

import { themeStatusPage, themeNamedIn } from "../vite.theme-page.js";
import { phosphorWoff2Only } from "../vite.static-tool.js";
import {
  FIXED_NOW,
  demoIncidents,
  demoResponseTimes,
  demoStatus,
} from "../demo/fixtures.mjs";

const SITE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(SITE, "dist");
const OUT = resolve(SITE, "..", "docs", "screenshot.png");
/**
 * The same capture without the window around it, for the start page.
 *
 * The README wants a window, because it is read on a page that has none. The
 * start page puts the picture behind a monitor of its own, and a second frame
 * inside that one would read as a screen showing a screenshot rather than as a
 * screen showing the page.
 */
const SCREEN_OUT = resolve(SITE, "src", "website", "assets", "screenshot-screen.png");

/** CSS px width the demo page renders at; the column (max 760) sits centred with margin. */
const PAGE_W = 1180;
/** CSS px height captured — shows logo, hero, range bar, and the first cards. */
const PAGE_H = 760;
/** Four by three, the proportion of the tube the start page shows it in. */
const SCREEN_H = Math.round((PAGE_W * 3) / 4);
/**
 * Transparent room around the window, in CSS px, sized to hold its drop shadow.
 *
 * The picture carries no background of its own. Whatever displays it supplies
 * that, which is what lets the website run its own tint out to both edges of
 * the window behind an unchanged screenshot, and lets the README sit the same
 * image on whichever GitHub theme the reader uses.
 */
const FRAME_PAD = 80;
/** The shadow reaches further down than sideways, so the bottom gets more. */
const FRAME_PAD_BOTTOM = 130;

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
};

/** Serve `dist/` statically, falling back to index.html (SPA). @returns {Promise<{base:string, close:()=>void}>} */
async function serveDist() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent((req.url ?? "/").split("?")[0]);
      if (p === "/") p = "/index.html";
      let file = join(DIST, p);
      try {
        if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      } catch {
        // not a directory; fall through to the read below
      }
      let body;
      try {
        body = await readFile(file);
      } catch {
        body = await readFile(join(DIST, "index.html"));
        file = "index.html";
      }
      res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  await new Promise((r) => server.listen(0, r));
  return { base: `http://localhost:${server.address().port}`, close: () => server.close() };
}

async function main() {
  // 1. The real configuration pipeline, which is also the first smoke test:
  //    the demo velvet.yml through the same generator an installation runs.
  const workspace = await mkdtemp(join(tmpdir(), "velvet-screenshot-"));
  const configPath = join(workspace, "config.json");
  const dataPath = join(workspace, "data");
  execFileSync(process.execPath, ["scripts/generate-config.mjs", "demo/velvet.yml", configPath], {
    cwd: SITE,
    stdio: "inherit",
  });

  // 2. The documents the Action checks out, written where the build reads them.
  await mkdir(dataPath, { recursive: true });
  for (const [name, document] of [
    ["status.json", demoStatus],
    ["response-times.json", demoResponseTimes],
    ["incidents.json", demoIncidents],
  ]) {
    await writeFile(join(dataPath, name), JSON.stringify(document));
  }

  // 3. The build itself, driven exactly as `vite.config.ts` drives it, with the
  //    demo configuration in place of the one in `public/`.
  const theme = themeNamedIn(configPath);
  assert.ok(theme, "demo/velvet.yml must name the theme its page is published in");
  await build({
    root: SITE,
    configFile: false,
    logLevel: "silent",
    base: "./",
    plugins: [
      phosphorWoff2Only,
      svelte(),
      themeStatusPage({ root: SITE, configPath, dataPath, theme }),
    ],
    build: { outDir: DIST, emptyOutDir: true },
  });

  const site = await serveDist();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: PAGE_W, height: PAGE_H },
      deviceScaleFactor: 1.5,
      reducedMotion: "reduce",
      timezoneId: "UTC",
    });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(FIXED_NOW));

    const offsiteRequests = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith(site.base)) offsiteRequests.push(url);
    });

    await page.goto(site.base, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500); // let the icon font + bars settle

    // A published page asks nobody for anything: its data was rendered into it
    // and its faces ship beside it.
    assert.deepEqual(offsiteRequests, []);

    // Every service the demo configuration names is on the page, with the
    // installation's own name above them.
    // Read as the source rather than as rendered: a theme may set its headings
    // in capitals, and what is asserted here is what the page says.
    const text = await page.evaluate(() => document.body.textContent ?? "");
    assert.match(text, /Velvet Underground Inc\./);
    for (const service of demoStatus.services) {
      assert.match(text, new RegExp(service.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")));
    }

    const shot = await page.screenshot({ type: "png" });

    // The start page's copy is taken again at the proportion a cathode ray tube
    // has, so the picture fills the screen without being stretched into it. The
    // window above keeps the wider frame it was composed for.
    await page.setViewportSize({ width: PAGE_W, height: SCREEN_H });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    const screenShot = await page.screenshot({ type: "png" });
    await writeFile(SCREEN_OUT, screenShot);
    console.log(
      `velvet: wrote ${SCREEN_OUT} (${(screenShot.length / 1024).toFixed(0)} KB)`,
    );

    // Nothing may reach past the edge of a phone, which is what a status page
    // is most often opened on.
    await page.setViewportSize({ width: 390, height: PAGE_H });
    await page.waitForTimeout(150);
    const narrowLayout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(
      narrowLayout.documentWidth <= narrowLayout.viewportWidth,
      `narrow layout should not create horizontal scrolling: ${JSON.stringify(narrowLayout)}`,
    );
    await page.setViewportSize({ width: PAGE_W, height: PAGE_H });

    // 2. Frame the page in a macOS-style window (traffic lights + Finder-like toolbar)
    //    sitting on a gradient with rounded OUTER corners and a soft shadow.
    const BAR_H = 52;
    const frame = await ctx.newPage();
    await frame.setViewportSize({
      width: PAGE_W + FRAME_PAD * 2 + 40,
      height: PAGE_H + BAR_H + FRAME_PAD + FRAME_PAD_BOTTOM + 40,
    });
    const chevL = `<svg width="8" height="13" viewBox="0 0 8 13" fill="none"><path d="M6.5 1 1.5 6.5 6.5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const chevR = `<svg width="8" height="13" viewBox="0 0 8 13" fill="none"><path d="M1.5 1 6.5 6.5 1.5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const gridIcon = `<svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor"><rect x="1" y="1" width="5.5" height="5.5" rx="1.2"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1.2"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1.2"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.2"/></svg>`;
    const searchIcon = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.4" stroke="currentColor" stroke-width="1.3"/><path d="M9.6 9.6 13 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
    await frame.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
        *{margin:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
        /* No background of its own. The transparent margin exists only so the
           shadow is not clipped, which leaves whatever displays the picture
           free to put its own surface behind it. */
        #frame{display:inline-block;
          padding:${FRAME_PAD}px ${FRAME_PAD}px ${FRAME_PAD_BOTTOM}px;
          background:transparent}
        #win{width:${PAGE_W}px;border-radius:12px;overflow:hidden;
          border:1px solid rgba(255,255,255,.08);
          box-shadow:0 34px 78px rgba(0,0,0,.6),0 10px 26px rgba(0,0,0,.5)}
        #bar{height:${BAR_H}px;display:flex;align-items:center;gap:18px;padding:0 20px;
          position:relative;background:#2b2b31;border-bottom:1px solid rgba(0,0,0,.45)}
        .lights{display:flex;gap:8px}
        .lights span{width:12px;height:12px;border-radius:50%;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.18)}
        .r{background:#ff5f57}.y{background:#febc2e}.g{background:#28c840}
        .chev{display:flex;gap:18px;color:rgba(255,255,255,.32)}
        .title{position:absolute;left:0;right:0;text-align:center;pointer-events:none;
          font-size:13px;font-weight:600;color:rgba(255,255,255,.62)}
        .tools{margin-left:auto;display:flex;align-items:center;gap:14px;color:rgba(255,255,255,.42)}
        .search{display:flex;align-items:center;gap:6px;width:128px;height:25px;padding:0 8px;
          border-radius:6px;background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.07);color:rgba(255,255,255,.36);font-size:11px}
        img{display:block;width:${PAGE_W}px}
      </style></head><body>
        <div id="frame"><div id="win">
          <div id="bar">
            <div class="lights"><span class="r"></span><span class="y"></span><span class="g"></span></div>
            <div class="chev">${chevL}${chevR}</div>
            <div class="title">Status</div>
            <div class="tools">${gridIcon}<div class="search">${searchIcon}<span>Search</span></div></div>
          </div>
          <img src="data:image/png;base64,${shot.toString("base64")}">
        </div></div>
      </body></html>`,
    );
    const el = await frame.$("#frame");
    const framed = await el.screenshot({ type: "png", omitBackground: true });
    await writeFile(OUT, framed);
    console.log(`velvet: wrote ${OUT} (${(framed.length / 1024).toFixed(0)} KB)`);

    // Compress in place when pngquant is available — keeps the gradient smooth at a
    // fraction of the size. Graceful no-op if pngquant isn't installed.
    try {
      execFileSync("pngquant", ["--quality=80-96", "--force", "--strip", "--output", OUT, OUT], {
        stdio: "ignore",
      });
      execFileSync(
        "pngquant",
        ["--quality=80-96", "--force", "--strip", "--output", SCREEN_OUT, SCREEN_OUT],
        { stdio: "ignore" },
      );
      console.log(`velvet: compressed to ${((await stat(OUT)).size / 1024).toFixed(0)} KB`);
    } catch {
      console.log("velvet: pngquant not found — left PNG uncompressed");
    }
  } finally {
    await browser.close();
    site.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
