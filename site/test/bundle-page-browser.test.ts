import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "playwright";
import { build } from "vite";

import { refuseOffsiteRequests } from "./offline.js";
import { bundleStatusPage } from "../vite.bundle-page.js";
import { phosphorWoff2Only } from "../vite.static-tool.js";
import { uptimeForRange } from "../src/lib/data.js";
import type { StatusDocument } from "../src/lib/types.js";

/**
 * What an installation that named a design actually receives.
 *
 * The build is verified against the published page rather than against its own
 * output: the document is read as a reader receives it before any script has
 * run, and then opened in a browser to see whether the design's own script took
 * over what was published rather than building a second page beside it.
 */

const BROWSER_TIMEOUT_MS = 240_000;
const siteRoot = resolve(import.meta.dirname, "..");
const fixtures = resolve(siteRoot, "../packages/contracts/fixtures/valid");

/** Builds the page the way a published installation receives it. */
async function buildDesignPage(design: string): Promise<{
  outDir: string;
  status: StatusDocument;
  cleanup: () => Promise<void>;
}> {
  const workspace = await mkdtemp(join(tmpdir(), "velvet-design-"));
  const dataPath = join(workspace, "data");
  const outDir = join(workspace, "dist");
  await mkdir(dataPath, { recursive: true });
  await cp(join(fixtures, "status/dual-stack.json"), join(dataPath, "status.json"));
  await cp(
    join(fixtures, "response-times/with-unavailable.json"),
    join(dataPath, "response-times.json"),
  );
  await cp(join(fixtures, "incidents/incident.json"), join(dataPath, "incidents.json"));

  const configPath = join(workspace, "config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      owner: "example",
      repo: "status",
      name: "Example",
      dataBaseUrl: "./",
      defaultRange: "month",
      design,
      serial: 42,
    }),
  );

  await build({
    root: siteRoot,
    configFile: false,
    logLevel: "silent",
    base: "./",
    plugins: [
      phosphorWoff2Only,
      svelte(),
      bundleStatusPage({ root: siteRoot, configPath, dataPath, design }),
    ],
    build: { outDir, emptyOutDir: true },
  });

  return {
    outDir,
    status: JSON.parse(
      await readFile(join(dataPath, "status.json"), "utf8"),
    ) as StatusDocument,
    cleanup: () => rm(workspace, { recursive: true, force: true }),
  };
}

test(
  "publishes the named design, in its own colours, working without the component page",
  async () => {
    const built = await buildDesignPage("proof");
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        const file = Bun.file(join(built.outDir, path === "/" ? "index.html" : path));
        return (await file.exists())
          ? new Response(file)
          : new Response(null, { status: 404 });
      },
    });

    const browser = await chromium.launch();
    try {
      const published = await readFile(join(built.outDir, "index.html"), "utf8");

      // What a reader receives before a single script has run. A status page is
      // opened when something is already broken, often over a connection that
      // is part of what is broken.
      assert.match(published, /class="proof-page"/);
      for (const service of built.status.services) {
        assert.ok(
          published.includes(service.name),
          `the published document names ${service.name}`,
        );
        const figure = uptimeForRange(
          service,
          "month",
          built.status.generatedAt,
          built.status.monitoringStartedAt,
        );
        assert.ok(
          published.includes(figure),
          `the published document carries ${service.name}'s uptime of ${figure}`,
        );
      }

      // A bundle carries its own appearance, so the injected `:root` block that
      // themed the component page is gone and the design's own stylesheet is
      // linked instead.
      assert.doesNotMatch(published, /<style>\s*:root \{/s);
      assert.match(published, /<link rel="stylesheet"[^>]*href="[^"]*\.css"/);

      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await refuseOffsiteRequests(page);
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));

      await page.goto(`http://127.0.0.1:${server.port}/`);
      await page.locator(".proof-page").first().waitFor();

      // One page, not the published one with a second built beside it.
      assert.equal(await page.locator(".proof-page").count(), 1);

      // The design's script took over: a range the page was not published in
      // rewrites every figure, and it does so from the data in the document
      // rather than by fetching anything.
      const first = built.status.services[0]!;
      const before = await page
        .locator(`[data-uptime-for="${first.id}"]`)
        .textContent();
      await page.locator('.proof-range[data-range="week"]').click();
      const after = await page
        .locator(`[data-uptime-for="${first.id}"]`)
        .textContent();
      assert.equal(
        after?.includes(
          uptimeForRange(
            first,
            "week",
            built.status.generatedAt,
            built.status.monitoringStartedAt,
          ),
        ),
        true,
        `after switching to 7d the figure reads ${after}, and read ${before} before`,
      );

      assert.deepEqual(failures, []);
      await page.close();
    } finally {
      await browser.close();
      await server.stop(true);
      await built.cleanup();
    }
  },
  BROWSER_TIMEOUT_MS,
);

test(
  "stops the build rather than publishing a design nobody asked for",
  async () => {
    await assert.rejects(
      buildDesignPage("no-such-design"),
      /there is no design called "no-such-design"/,
    );
  },
  BROWSER_TIMEOUT_MS,
);
