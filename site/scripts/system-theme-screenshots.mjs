/**
 * Generate the four onboarding theme cards from the production Configurator.
 * The Configurator renders the real Velvet preview fixture with the same
 * StatusPage component used by deployed sites.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { EMBEDDED_THEME_REGISTRY } from "../src/configurator/theme-registry.ts";
import { canonicalSystemTheme } from "../src/lib/configuration-theme.ts";

const SITE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DISTRIBUTION = resolve(SITE, "../configurator");
const ASSETS = resolve(SITE, "src/components/theme-card/assets");
const VIEWPORT = { width: 640, height: 400 };
const MIME = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function serveDistribution() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
      const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
      const file = join(DISTRIBUTION, relativePath);
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch (error) {
      response.writeHead(404);
      response.end(String(error));
    }
  });
  await new Promise((resolveListening) => server.listen(0, resolveListening));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing server port.");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

function buildConfigurator() {
  execFileSync(
    process.execPath,
    ["x", "vite", "build", "--config", "vite.configurator.ts"],
    {
      cwd: SITE,
      stdio: "inherit",
    },
  );
}

async function main() {
  buildConfigurator();
  await mkdir(ASSETS, { recursive: true });

  const server = await serveDistribution();
  const browser = await chromium.launch();
  const manifest = {
    schemaVersion: 1,
    viewport: VIEWPORT,
    themes: {},
  };

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date("2026-07-27T12:00:00.000Z"));
    await page.route("https://phranck.github.io/velvet-themes/index.json", (route) =>
      route.abort(),
    );

    for (const theme of EMBEDDED_THEME_REGISTRY.themes) {
      await page.goto(server.url, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Community themes" }).click();
      await page.locator(`#theme-registry-option-${theme.id}`).click();
      await page.addStyleTag({
        content: `.status-page {
          width: ${VIEWPORT.width}px !important;
          max-width: ${VIEWPORT.width}px !important;
        }`,
      });
      await page.evaluate(() => globalThis.document.fonts.ready);
      await page.waitForTimeout(50);

      const statusPage = await page.locator(".status-page").boundingBox();
      if (!statusPage) throw new Error("Missing Configurator status preview.");
      const clip = {
        x: Math.round(statusPage.x),
        y: Math.round(statusPage.y),
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      };
      const image = await page.screenshot({ type: "png", clip });
      const file = `${theme.id}.png`;
      await writeFile(join(ASSETS, file), image);
      manifest.themes[theme.id] = {
        file,
        imageSha256: sha256(image),
        themeSha256: sha256(JSON.stringify(canonicalSystemTheme(theme))),
      };
    }

    await writeFile(
      join(ASSETS, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    for (const { id } of EMBEDDED_THEME_REGISTRY.themes) {
      const bytes = (await stat(join(ASSETS, `${id}.png`))).size;
      if (bytes < 10_000) throw new Error(`Theme screenshot is unexpectedly small: ${id}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  buildConfigurator();
}

await main();
