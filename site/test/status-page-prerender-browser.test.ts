import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { webkit } from "playwright";
import { build } from "vite";

import { refuseOffsiteRequests } from "./offline.js";
import { phosphorWoff2Only } from "../vite.static-tool.js";
import { prerenderStatusPage } from "../vite.status-prerender.js";

/**
 * Exercises the published status page: what it says before any script has run,
 * and whether the browser can adopt that markup rather than replace it.
 *
 * Both halves matter and neither proves the other. Markup with no hydration is
 * a page that goes dead on the first click; hydration with no markup is the
 * blank document this replaced.
 */

const BROWSER_TIMEOUT_MS = 180_000;
const siteRoot = resolve(import.meta.dirname, "..");
const fixtures = resolve(siteRoot, "../packages/contracts/fixtures/valid");

/**
 * Builds the status page the way a published installation receives it.
 *
 * The data documents are copied beside the built page and the configuration
 * points at them, so the page can refresh itself after hydrating without
 * reaching a network the test has no business depending on.
 *
 * @returns The output directory, and how to remove it.
 */
async function buildPublishedPage(): Promise<{
  outDir: string;
  cleanup: () => Promise<void>;
}> {
  const workspace = await mkdtemp(join(tmpdir(), "velvet-prerender-"));
  const dataPath = join(workspace, "data");
  const outDir = join(workspace, "dist");
  await mkdir(dataPath, { recursive: true });
  await cp(join(fixtures, "status/dual-stack.json"), join(dataPath, "status.json"));
  await cp(
    join(fixtures, "response-times/with-unavailable.json"),
    join(dataPath, "response-times.json"),
  );
  await cp(
    join(fixtures, "incidents/incident.json"),
    join(dataPath, "incidents.json"),
  );

  const configPath = join(workspace, "config.json");
  await writeFile(
    configPath,
    JSON.stringify({
      owner: "example",
      repo: "status",
      name: "Example",
      // Relative, so the page refreshes from the documents copied beside it
      // rather than from GitHub, which this test must not depend on.
      dataBaseUrl: "./",
      defaultRange: "month",
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
      prerenderStatusPage({ root: siteRoot, configPath, dataPath }),
    ],
    build: { outDir, emptyOutDir: true },
  });

  // What the Action copies into the published site: the configuration the page
  // reads at runtime, and the documents it refreshes from.
  await cp(configPath, join(outDir, "config.json"));
  await cp(dataPath, outDir, { recursive: true });

  return {
    outDir,
    cleanup: () => rm(workspace, { recursive: true, force: true }),
  };
}

test(
  "publishes a readable document and hydrates it without contradicting itself",
  async () => {
    const built = await buildPublishedPage();
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const path = new URL(request.url).pathname;
        const file = Bun.file(
          join(built.outDir, path === "/" ? "index.html" : path),
        );
        return (await file.exists())
          ? new Response(file)
          : new Response(null, { status: 404 });
      },
    });

    const browser = await webkit.launch();
    try {
      // What a reader receives before a single script has run, which is the
      // whole point: a status page is opened when something is already broken,
      // often over a connection that is part of what is broken.
      const published = await readFile(join(built.outDir, "index.html"), "utf8");
      const visible = published
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<style[\s\S]*?<\/style>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      assert.ok(
        visible.length > 300,
        `the published document carries its content, got ${visible.length} characters`,
      );
      assert.match(visible, /All systems operational/);
      assert.doesNotMatch(visible, /Loading status/);
      // Themed by the build rather than by the script that themes it at
      // runtime, so the page is in its own colours at first paint.
      assert.match(published, /<style>\s*:root \{[^}]*--accent/s);

      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await refuseOffsiteRequests(page);
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));

      // Whether the published markup was adopted or thrown away and rebuilt is
      // the only thing that decides if prerendering bought anything, and both
      // outcomes look identical on screen. Svelte does not throw on a mismatch
      // either, so the answer has to come from the nodes themselves: this holds
      // on to the first card the parser produced and reports whether the
      // document still contains that same node afterwards.
      await page.addInitScript(() => {
        const state = window as unknown as {
          velvetFirstCard?: Element;
          velvetCardKept?: boolean;
        };
        new MutationObserver(() => {
          const card = document.querySelector(".status-page .card");
          if (!card) return;
          state.velvetFirstCard ??= card;
          state.velvetCardKept = state.velvetFirstCard.isConnected;
        }).observe(document, { childList: true, subtree: true });
      });

      await page.goto(`http://127.0.0.1:${server.port}/`);
      await page.locator(".status-page").first().waitFor();

      // Mounting rather than hydrating leaves the published markup untouched
      // and builds a second copy beside it, so the count is what says which of
      // the two happened. Both look identical on screen.
      assert.equal(
        await page.locator(".status-page").count(),
        1,
        "the page was adopted, not rebuilt beside what was published",
      );

      const adopted = await page.evaluate(() => {
        const state = window as unknown as {
          velvetFirstCard?: Element;
          velvetCardKept?: boolean;
        };
        return {
          sawPrerenderedCard: state.velvetFirstCard !== undefined,
          stillConnected: state.velvetFirstCard?.isConnected ?? false,
          keptThroughout: state.velvetCardKept ?? false,
        };
      });
      assert.equal(
        adopted.sawPrerenderedCard,
        true,
        "the parser produced a card before any script ran",
      );
      assert.equal(
        adopted.stillConnected,
        true,
        "hydration adopted that node rather than replacing the markup",
      );
      assert.equal(adopted.keptThroughout, true, "the node was never swapped");
      assert.deepEqual(failures, [], "the page ran without throwing");

      // Adopted markup still has to be alive. A panel that cannot be opened is
      // what a prerender without hydration would leave behind.
      const details = page.locator(".status-page [id$='-details']");
      const services = await details.count();
      assert.ok(services > 0, "the page renders services");
      await page.locator(".status-page .toggle-all").click();
      await page.waitForFunction(
        (expected) =>
          document.querySelectorAll(".status-page [id$='-details']:not([hidden])")
            .length === expected,
        services,
      );
    } finally {
      await browser.close();
      server.stop(true);
      await built.cleanup();
    }
  },
  BROWSER_TIMEOUT_MS,
);
