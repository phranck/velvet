/**
 * Photograph every design, for the gallery on the start page.
 *
 * Taken from `site/gallery/design.html`, which renders one bundle into a
 * document of its own with that bundle's own stylesheet linked and its own
 * script run. A picture from there cannot drift from what an installation gets,
 * because it is the same three files published.
 *
 * Every picture shows a well page. Four status pages reporting an outage is the
 * wrong thing to greet somebody meeting Velvet for the first time, so the
 * `all-well` fixture is what is rendered.
 *
 * The pictures are cut to a squircle on the start page, and a squircle pulls in
 * towards its corners. The page is therefore held in from the edge of the
 * picture, so the curve meets the design's own background rather than the ends
 * of its first and last rows.
 *
 * Run it after changing a design:
 *
 * ```bash
 * bun run --cwd site designs:screenshots
 * ```
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

import { readBundles } from "./bundles.js";

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const directory = join(siteRoot, "src/website/assets/designs");

/** The fixture every picture is taken on. */
const FIXTURE = "all-well";

/** How large a picture is, and how far the page is held in from its edge. */
const VIEWPORT = { width: 800, height: 500 };
const CONTENT_INSET = { inline: 60, block: 38 };

/**
 * The design that exists to prove the format rather than to be chosen.
 *
 * It is a bundle like any other and the gates run over it, but it is not a
 * design anybody picks, so the start page does not offer it.
 */
const NOT_OFFERED = new Set(["proof"]);

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

const bundles = (await readBundles()).filter(
  (bundle) => bundle.manifest && !NOT_OFFERED.has(bundle.directory),
);
if (bundles.length === 0) throw new Error("No design to photograph.");

await mkdir(directory, { recursive: true });

const server = await createServer({
  root: siteRoot,
  logLevel: "warn",
  server: { port: 0 },
});
await server.listen();
const address = server.resolvedUrls?.local[0];
if (!address) throw new Error("The dev server reported no address.");

const browser = await chromium.launch();
const manifest: {
  schemaVersion: number;
  viewport: typeof VIEWPORT;
  fixture: string;
  contentInset: typeof CONTENT_INSET;
  designs: Record<string, { file: string; imageSha256: string; bundleSha256: string }>;
} = {
  schemaVersion: 1,
  viewport: VIEWPORT,
  fixture: FIXTURE,
  contentInset: CONTENT_INSET,
  designs: {},
};

try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    timezoneId: "UTC",
  });

  for (const bundle of bundles) {
    const id = bundle.manifest!.id;
    await page.goto(
      `${address}gallery/design.html?design=${encodeURIComponent(id)}&fixture=${FIXTURE}`,
      { waitUntil: "networkidle" },
    );
    // The design's own root, held to the width of the picture and padded so the
    // squircle's curve meets its background rather than its content.
    await page.addStyleTag({
      content: `#velvet-root > * {
        width: ${VIEWPORT.width}px !important;
        max-width: ${VIEWPORT.width}px !important;
        box-sizing: border-box !important;
        padding-inline: ${CONTENT_INSET.inline}px !important;
        padding-block: ${CONTENT_INSET.block}px !important;
      }`,
    });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(120);

    const box = await page.locator("#velvet-root > *").boundingBox();
    if (!box) throw new Error(`${id} rendered nothing to photograph.`);
    const image = await page.screenshot({
      type: "png",
      clip: {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: VIEWPORT.width,
        height: VIEWPORT.height,
      },
    });

    const file = `${id}.png`;
    await writeFile(join(directory, file), image);
    // Every file of the bundle, so a picture cannot survive a change to the
    // design it is a picture of.
    const bundleSha256 = sha256(
      bundle.files
        .map((entry) => `${entry.path}:${sha256(entry.text)}`)
        .sort()
        .join("\n"),
    );
    manifest.designs[id] = { file, imageSha256: sha256(image), bundleSha256 };
    console.log(`  ok    ${id}  ${image.byteLength} bytes`);
  }

  await writeFile(
    join(directory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  for (const id of Object.keys(manifest.designs)) {
    const bytes = (await stat(join(directory, `${id}.png`))).size;
    if (bytes < 10_000) {
      throw new Error(`The picture of ${id} is unexpectedly small: ${bytes} bytes`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}

// Read back, so a run that wrote nothing cannot pass quietly.
const written = JSON.parse(
  await readFile(join(directory, "manifest.json"), "utf8"),
) as { designs: Record<string, unknown> };
console.log(`\n${Object.keys(written.designs).length} design(s) photographed.`);
