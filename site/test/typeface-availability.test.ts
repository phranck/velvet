import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "bun:test";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { chromium } from "playwright";
import { createServer } from "vite";

import { refuseOffsiteRequests } from "./offline.js";
import { createViteTestCache } from "./vite-test-cache.js";

/** Five surfaces, one browser, and a dependency-optimisation pass. */
const TIMEOUT_MS = 180_000;

/**
 * How a surface obtains the face it sets its text in.
 *
 * `bundled` means the file ships with the surface, which is what every tool
 * does. `linked` means the document asks another service for it, which only the
 * status page does and only because an installation may name a face of its own.
 * `system` means it deliberately renders in the reader's own interface face and
 * fetches nothing.
 */
type FaceSource = "bundled" | "linked" | "system";

const SURFACES: readonly {
  document: string;
  face?: string;
  source: FaceSource;
}[] = [
  { document: "index.html", face: "Inter", source: "linked" },
  { document: "onboarding.html", face: "Barlow", source: "bundled" },
  { document: "website.html", face: "Barlow", source: "bundled" },
  { document: "documentation.html", face: "Barlow", source: "bundled" },
  { document: "configurator.html", source: "system" },
];

test("sets each surface's text in a face that surface has arranged to obtain", async () => {
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
      // Nothing here may be timed by somebody else's server. The status page's
      // own webfont request is refused with everything else, which is why the
      // assertion below reads the link the document carries rather than
      // waiting for the file to arrive.
      await refuseOffsiteRequests(page);
      await page.goto(`${base}/${surface.document}`, { waitUntil: "load" });
      const measured = await page.evaluate(() => ({
        // The first family named is the one the surface asks for. The rest of
        // the stack is only what it falls back to when that one is missing,
        // which is precisely the state this test exists to catch.
        named: getComputedStyle(document.body)
          .fontFamily.split(",")[0]
          .replaceAll('"', "")
          .trim(),
        declared: [...new Set([...document.fonts].map((face) => face.family))],
        stylesheets: [...document.querySelectorAll("link[rel='stylesheet']")].map(
          (link) => link.getAttribute("href") ?? "",
        ),
      }));
      await page.close();

      if (surface.source === "system") {
        assert.ok(
          measured.named.startsWith("-apple-system") ||
            measured.named.startsWith("system-ui"),
          `${surface.document} names ${measured.named} rather than the system face`,
        );
        continue;
      }

      const face = surface.face ?? "";
      assert.equal(
        measured.named,
        face,
        `${surface.document} sets its text in ${measured.named}`,
      );

      // The point of the test. A surface naming a face it never obtains renders
      // in whatever comes next in the stack whilst its stylesheet reads as
      // though the named one were in use. All three tools named Inter and none
      // of them has it.
      if (surface.source === "bundled") {
        assert.ok(
          measured.declared.includes(face),
          `${surface.document} names ${face} and declares ${measured.declared.join(", ")}`,
        );
      } else {
        assert.ok(
          measured.stylesheets.some((href) => href.includes(`family=${face}`)),
          `${surface.document} names ${face} and asks no service for it`,
        );
      }
    }
  } finally {
    await browser.close();
    await server.close();
    await cache.cleanup();
  }
}, TIMEOUT_MS);
