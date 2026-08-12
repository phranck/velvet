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

test("does not defer a picture that is already on screen", async () => {
  const site = await serve(await buildWebsite());
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await refuseOffsiteRequests(page);
    await page.goto(site.base, { waitUntil: "load" });
    const measured = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>(".hero-shot img")!;
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

test("copies the terminal's commands from the screen they are printed on", async () => {
  const site = await serve(await buildWebsite());
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await refuseOffsiteRequests(page);
    await page.goto(site.base, { waitUntil: "load" });

    // The page ships prerendered with no bundle, so the key is markup until the
    // one inlined script finds it. It is published disabled precisely so a
    // reader whose script never runs is shown no control rather than a dead
    // one, which makes "is it enabled" the honest test of that wiring.
    const key = page.locator("[data-copy-terminal]");
    assert.equal(await key.isDisabled(), false, "the script enabled the key");
    // Drawn either way, because it is part of the front panel and a panel with
    // a hole in it is a broken machine.
    assert.equal(await key.isVisible(), true, "the key is on the panel");

    // The clipboard is stubbed rather than granted, because what matters here
    // is what the page hands over, not whether this runner allows a write.
    const written = await page.evaluate(async () => {
      const received: string[] = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            received.push(text);
          },
        },
      });
      const button = document.querySelector<HTMLButtonElement>("[data-copy-terminal]")!;
      button.click();
      await new Promise((settled) => setTimeout(settled, 100));
      return received[0] ?? null;
    });

    // The screen and the clipboard cannot disagree, because the one is read out
    // of the other. Compared against what the document actually prints rather
    // than against a copy of the commands kept here, which would only prove
    // that two lists in two files still matched.
    const onScreen = await page.evaluate(() =>
      [...document.querySelectorAll("[data-terminal-command]")]
        .map((line) => line.textContent!.trim())
        .join("\n"),
    );
    assert.equal(written, onScreen, "the clipboard carries what the screen shows");
    assert.match(written ?? "", /velvet-man-pages\.tar\.gz/);

    // The confirmation is printed on the screen rather than under the finger,
    // and it was already there: what the press changes is whether it is shown,
    // so no line on the screen moves when it appears.
    const marker = page.locator("[data-terminal-copied]");
    assert.equal(await marker.textContent(), "* COPIED *");
    assert.equal(
      await marker.evaluate((element) => getComputedStyle(element).visibility),
      "visible",
    );
    await page.close();
  } finally {
    await browser.close();
    site.close();
  }
}, TIMEOUT_MS);
