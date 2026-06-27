/**
 * Regenerate the README screenshot from a demo status page.
 *
 * This drives the REAL Velvet pipeline end to end, so it doubles as a smoke test:
 *   1. run `generate-config.mjs` on `demo/.upptimerc.yml` (the same step the
 *      template's velvet.yml runs) → `dist/config.json`,
 *   2. serve the built `dist/`,
 *   3. render it in headless Chromium with the demo monitoring data
 *      (`demo/fixtures.mjs`) fed in via request mocks and the clock frozen so the
 *      result is byte-stable,
 *   4. frame the page on a gradient (rounded corners + shadow),
 *   5. write `docs/screenshot.png`.
 *
 * Requires a prior `vite build` (the CI workflow builds first). Run: `npm run screenshot`.
 */
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { DEMO_OWNER, DEMO_REPO, FIXED_NOW, demoIssues, demoRepo, demoSummary } from "../demo/fixtures.mjs";

const SITE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = join(SITE, "dist");
const OUT = resolve(SITE, "..", "docs", "screenshot.png");

/** CSS px width the demo page renders at; the column (max 760) sits centred with margin. */
const PAGE_W = 1180;
/** CSS px height captured — shows logo, hero, range bar, and the first cards. */
const PAGE_H = 760;
/** Padding around the framed card, in CSS px. */
const FRAME_PAD = 88;

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

/** A 200 JSON route fulfilment. */
const json = (data) => ({ status: 200, contentType: "application/json", body: JSON.stringify(data) });

async function main() {
  // 1. Real config pipeline (also the smoke test): demo .upptimerc.yml → dist/config.json.
  execFileSync("node", ["scripts/generate-config.mjs", "demo/.upptimerc.yml", "dist/config.json"], {
    cwd: SITE,
    stdio: "inherit",
  });

  const site = await serveDist();
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: PAGE_W, height: PAGE_H }, deviceScaleFactor: 1.5 });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(FIXED_NOW));

    // Feed the demo monitoring data: summary.json (GitHub raw) + issues/repo (GitHub API).
    await page.route("**/raw.githubusercontent.com/**", (r) => r.fulfill(json(demoSummary)));
    await page.route("**/api.github.com/**", (r) =>
      r.fulfill(json(r.request().url().includes("/issues") ? demoIssues : demoRepo)),
    );

    await page.goto(site.base, { waitUntil: "load" });
    await page.waitForSelector(".card");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500); // let the icon font + bars settle

    const shot = await page.screenshot({ type: "png" });

    // 2. Frame the page in a macOS-style window (traffic lights + Finder-like toolbar)
    //    sitting on a gradient with rounded OUTER corners and a soft shadow.
    const BAR_H = 52;
    const frame = await ctx.newPage();
    await frame.setViewportSize({
      width: PAGE_W + FRAME_PAD * 2 + 40,
      height: PAGE_H + BAR_H + FRAME_PAD * 2 + 40,
    });
    const chevL = `<svg width="8" height="13" viewBox="0 0 8 13" fill="none"><path d="M6.5 1 1.5 6.5 6.5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const chevR = `<svg width="8" height="13" viewBox="0 0 8 13" fill="none"><path d="M1.5 1 6.5 6.5 1.5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const gridIcon = `<svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor"><rect x="1" y="1" width="5.5" height="5.5" rx="1.2"/><rect x="8.5" y="1" width="5.5" height="5.5" rx="1.2"/><rect x="1" y="8.5" width="5.5" height="5.5" rx="1.2"/><rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.2"/></svg>`;
    const searchIcon = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.4" stroke="currentColor" stroke-width="1.3"/><path d="M9.6 9.6 13 13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`;
    await frame.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><style>
        *{margin:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
        #frame{display:inline-block;padding:${FRAME_PAD}px;border-radius:34px;
          background:linear-gradient(135deg,#5b21b6 0%,#7c3aed 28%,#c026d3 70%,#ec4899 100%)}
        #win{width:${PAGE_W}px;border-radius:12px;overflow:hidden;
          border:1px solid rgba(255,255,255,.08);
          box-shadow:0 60px 140px rgba(0,0,0,.55),0 14px 40px rgba(0,0,0,.45)}
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
