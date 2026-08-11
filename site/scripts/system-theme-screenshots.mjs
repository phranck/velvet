/**
 * Generate the theme pictures from the production Configurator.
 *
 * The Configurator renders the real Velvet preview fixture with the same
 * StatusPage component deployed sites use, so a picture here cannot drift from
 * what an installation actually looks like.
 *
 * The picker's own pictures, showing a well page: nothing somebody installing
 * Velvet sees should be four status pages reporting trouble. Each option in the
 * picker is nearly square, so the pictures are cut to four by three.
 *
 * The start page has its own set, photographed from the designs themselves by
 * `bun run --cwd site designs:screenshots`, because a page is published in a
 * design rather than in one of these.
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
import { PREVIEW_STATUS } from "../src/configurator/preview.ts";

const PREVIEW_GENERATED_AT = PREVIEW_STATUS.generatedAt;
const SITE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DISTRIBUTION = resolve(SITE, "../configurator");
/** Where the set is written, and what the page has to be showing for it. */
const SETS = [
  {
    // The picker, in the browser setup and in the Configurator. Nearly square,
    // because each option is, and a wider picture would leave a band of empty
    // card under it.
    directory: resolve(SITE, "src/components/theme-card/assets"),
    health: "operational",
    viewport: { width: 640, height: 480 },
  },
];
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
  for (const { directory } of SETS) await mkdir(directory, { recursive: true });

  const server = await serveDistribution();
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    // The same instant the preview fixture states it was generated at, so the
    // relative labels in the picture agree with the date printed on it.
    await page.clock.setFixedTime(new Date(PREVIEW_GENERATED_AT));
    await page.route("https://phranck.github.io/velvet-themes/index.json", (route) =>
      route.abort(),
    );

    for (const { directory, health, viewport, contentInset } of SETS) {
      const manifest = {
        schemaVersion: 1,
        viewport,
        health,
        ...(contentInset ? { contentInset } : {}),
        themes: {},
      };
      // The Configurator shows a degraded page by default and reads this to
      // show a well one instead. Nothing but this script asks for it.
      const address = health === "operational"
        ? `${server.url}/?preview=operational`
        : server.url;

      for (const theme of EMBEDDED_THEME_REGISTRY.themes) {
        await page.goto(address, { waitUntil: "networkidle" });
        // The theme picker lives in a section that opens on demand, so it is
        // not in the accessibility tree until the section is opened and no
        // query for it resolves. Opened the way a person opens it, by its
        // summary, rather than by setting the attribute.
        const section = page.locator("details:has([data-theme-picker])");
        if ((await section.getAttribute("open")) === null) {
          await section.locator("summary").first().click();
        }
        await page.getByRole("button", { name: "Community themes" }).click();
        await page.locator(`#theme-registry-option-${theme.id}`).click();
        await page.addStyleTag({
          content: `.status-page {
            width: ${viewport.width}px !important;
            max-width: ${viewport.width}px !important;
            box-sizing: border-box !important;
            padding-inline: ${contentInset?.inline ?? 0}px !important;
            padding-block: ${contentInset?.block ?? 0}px !important;
          }`,
        });
        await page.evaluate(() => globalThis.document.fonts.ready);
        await page.waitForTimeout(50);

        const statusPage = await page.locator(".status-page").boundingBox();
        if (!statusPage) throw new Error("Missing Configurator status preview.");
        const clip = {
          x: Math.round(statusPage.x),
          y: Math.round(statusPage.y),
          width: viewport.width,
          height: viewport.height,
        };
        const image = await page.screenshot({ type: "png", clip });
        const file = `${theme.id}.png`;
        await writeFile(join(directory, file), image);
        manifest.themes[theme.id] = {
          file,
          imageSha256: sha256(image),
          themeSha256: sha256(JSON.stringify(canonicalSystemTheme(theme))),
        };
      }

      await writeFile(
        join(directory, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      for (const { id } of EMBEDDED_THEME_REGISTRY.themes) {
        const bytes = (await stat(join(directory, `${id}.png`))).size;
        if (bytes < 10_000) throw new Error(`Theme screenshot is unexpectedly small: ${id}`);
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  buildConfigurator();
}

await main();
