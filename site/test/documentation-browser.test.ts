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
  ".woff2": "font/woff2",
};

/**
 * Builds the configuration reference the way the site publishes it.
 *
 * The published document is what has to be driven here rather than the dev
 * server, because the script under test is written into the page by the
 * prerender and does not exist anywhere else in the output.
 *
 * @returns The directory the page and its assets were written to.
 */
async function buildDocumentation(): Promise<string> {
  const outDir = await mkdtemp(resolve(tmpdir(), "velvet-documentation-"));
  await execFileAsync(
    process.execPath,
    [
      "run", "--bun", "vite", "build",
      "--config", "vite.documentation.ts",
      "--outDir", outDir,
      "--emptyOutDir",
    ],
    { cwd: siteRoot, maxBuffer: 64 * 1024 * 1024 },
  );
  return outDir;
}

/**
 * Serves a built directory over loopback.
 *
 * @param root - Directory to serve.
 * @returns The base address and a function that stops the server.
 */
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

/** How long a topic has to become the marked one after its link is followed. */
const MARK_TIMEOUT_MS = 8000;

test("marks the topic a reader has reached, including the last one", async () => {
  const site = await serve(await buildDocumentation());
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await refuseOffsiteRequests(page);
    await page.goto(site.base, { waitUntil: "load" });

    const marked = () =>
      page.evaluate(() => {
        const link = document.querySelector("[data-topic-link][data-current]");
        return link ? link.getAttribute("data-topic-link") : null;
      });
    const topics = await page.evaluate(() =>
      [...document.querySelectorAll("[data-topic-link]")].map(
        (link) => link.getAttribute("data-topic-link") ?? "",
      ),
    );
    assert.ok(topics.length > 2, "the reference has topics to mark");

    // At the top of the page nothing has been scrolled past, so the first topic
    // is the one being read.
    assert.equal(await marked(), topics[0]);

    // Following a link scrolls smoothly, so the mark is waited for rather than
    // read after a fixed pause. A pause either outlasts every short scroll or
    // falls short of one long one, and the second reads back whichever topic
    // the page happened to be passing through.
    const follow = async (topic: string) => {
      await page.click(`[data-topic-link="${topic}"]`);
      await page.waitForSelector(
        `[data-topic-link="${topic}"][data-current]`,
        { timeout: MARK_TIMEOUT_MS },
      );
    };

    // A topic in the middle, which the page can scroll far enough to put under
    // the bar. This is the case that always worked.
    await follow(topics[Math.floor(topics.length / 2)]);

    // The last topic, which the page cannot scroll far enough to put under the
    // bar whenever its section is shorter than a screenful. Measured on this
    // reference at a 900px window: scrolled to the foot of the page, at 14517
    // of a possible 14517, the last heading still sat at 566 against a line of
    // 120, and the mark stayed on the section before it.
    const last = topics[topics.length - 1];
    await follow(last);
    assert.equal(await marked(), last);
    assert.ok(
      await page.evaluate(
        () =>
          Math.ceil(scrollY + innerHeight) >=
          document.documentElement.scrollHeight,
      ),
      "following the last topic reaches the foot of the page",
    );
  } finally {
    await browser.close();
    site.close();
  }
}, TIMEOUT_MS);
