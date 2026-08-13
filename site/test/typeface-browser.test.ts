import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "playwright";
import { createServer } from "vite";

import { refuseOffsiteRequests } from "./offline.js";
import { createViteTestCache } from "./vite-test-cache.js";

/** Eight documents, one browser, and a dependency-optimisation pass. */
const TIMEOUT_MS = 180_000;

/**
 * How a document obtains the face it sets its text in.
 *
 * `bundled` means the files ship with it, which is what every tool and every
 * page does. `readers-own` means it fetches nothing and takes whatever the
 * reader's machine supplies, which only the status-page shell does, because a
 * design brings its own faces and an installation may name one of its own.
 */
type FaceSource = "bundled" | "readers-own";

/**
 * Every document Velvet publishes, and the face its ordinary text is set in.
 *
 * Velvet's typography is Datatype for text and Workbench for headings, with
 * code and labels the exceptions. The status page is outside that: its faces
 * come from whichever design is configured, so the shell beneath names none of
 * its own.
 */
const SURFACES: readonly {
  document: string;
  face: string;
  source: FaceSource;
  /**
   * Whether this document is part of velvet.li and so draws the site's card.
   *
   * The Configurator has cards of its own, which are panels in a tool rather
   * than surfaces on a page and are not held to the same shape.
   */
  site?: true;
}[] = [
  { document: "index.html", face: "-apple-system", source: "readers-own" },
  { document: "onboarding.html", face: "Datatype", source: "bundled" },
  { document: "configurator.html", face: "Datatype", source: "bundled" },
  { document: "website.html", face: "Datatype", source: "bundled", site: true },
  { document: "documentation.html", face: "Datatype", source: "bundled", site: true },
  { document: "changelog.html", face: "Datatype", source: "bundled", site: true },
  { document: "attributions.html", face: "Datatype", source: "bundled", site: true },
  { document: "references.html", face: "Datatype", source: "bundled", site: true },
];

/**
 * Faces a document may name without carrying a file for it.
 *
 * These are the generic families and the keywords that stand for whatever the
 * reader's own machine supplies. Nothing with a name of its own belongs here:
 * `JetBrains Mono` was allowed at first and that silently excused the very
 * fault this test was written for, because the surfaces naming it are the ones
 * that do not have it.
 */
const READERS_OWN =
  /^(?:ui-|system-ui|-apple-system|BlinkMacSystemFont|sans-serif|serif|monospace|cursive|fantasy|SFMono|Segoe|Consolas|Menlo|Liberation|Arial|Avenir|Helvetica)/;

test("draws one card and names no face a document is without", async () => {
  const cache = await createViteTestCache("typeface-availability");
  const server = await createServer({
    root: resolve(import.meta.dirname, ".."),
    cacheDir: cache.path,
    configFile: false,
    logLevel: "silent",
    plugins: [svelte()],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Missing Vite port.");
  const base = `http://127.0.0.1:${address.port}`;

  const browser = await chromium.launch();
  try {
    for (const surface of SURFACES) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      // Nothing here may be timed by somebody else's server. No document
      // fetches a face from one today; the check below reads any stylesheet
      // link a document carries, so one added later is seen rather than
      // silently refused and counted as missing.
      await refuseOffsiteRequests(page);
      await page.goto(`${base}/${surface.document}`, { waitUntil: "load" });
      const measured = await page.evaluate(() => {
        const first = (value: string) =>
          value.split(",")[0].replaceAll('"', "").trim();
        const elements = [
          document.body,
          ...document.querySelectorAll("h1, h2, h3, h4, h5, h6, code, pre, .mono"),
          // The Configurator's preview is left out. It draws a status page and
          // names that page's faces on purpose, including one an installation
          // may pick, so it is the one place where naming a face this document
          // does not carry is the right thing to do.
        ].filter((element) => !element.closest(".preview-workspace"));
        return {
          // The first family named is the one an element asks for. The rest of
          // the stack is only what it falls back to when that one is missing,
          // which is precisely the state this test exists to catch.
          body: first(getComputedStyle(document.body).fontFamily),
          named: [
            ...new Set(
              elements.map((element) =>
                first(getComputedStyle(element).fontFamily),
              ),
            ),
          ],
          available: [
            ...new Set([...document.fonts].map((face) => face.family)),
            // A face the document asks a font service for counts as one it has.
            // That request is refused here, so it never reaches
            // `document.fonts`, and the link is the only way to see it without
            // letting this test be timed by another machine.
            ...[...document.querySelectorAll("link[rel='stylesheet']")]
              .flatMap((link) => [
                ...(link.getAttribute("href") ?? "").matchAll(/family=([^:&]+)/g),
              ])
              .map(([, family]) => decodeURIComponent(family).replaceAll("+", " ")),
          ],
        };
      });
      await page.close();

      assert.equal(
        measured.body,
        surface.face,
        `${surface.document} sets its text in ${measured.body}`,
      );
      if (surface.source === "bundled") {
        assert.ok(
          measured.available.includes(surface.face),
          `${surface.document} names ${surface.face} and carries ${measured.available.join(", ")}`,
        );
      }

      // The point of the test, and the fault it was written for. A surface
      // naming a face it never obtains renders in whatever comes next in the
      // stack whilst its stylesheet reads as though the named one were in use.
      // Three surfaces claimed Inter, all four claimed JetBrains Mono for their
      // code, and one heading claimed the body face.
      const missing = measured.named.filter(
        (face) => !measured.available.includes(face) && !READERS_OWN.test(face),
      );
      assert.deepEqual(
        missing,
        [],
        `${surface.document} names ${missing.join(", ")} and carries none of it`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
    await cache.cleanup();
  }
}, TIMEOUT_MS);
