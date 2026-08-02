import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { defineConfig } from "vite";

import {
  phosphorWoff2Only,
  prerenderStaticEntry,
  renameHtmlEntry,
} from "./vite.static-tool.js";

/**
 * Vite config for the public velvet.li website.
 *
 * Unlike the onboarding and configurator bundles, this one is never committed.
 * Those two live at the repository root because the setup service serves them,
 * which is what obliges them to match their source on every CI run. The website
 * has no such consumer, so the Pages workflow uploads this directory as an
 * artefact and nothing enters the repository.
 *
 * `publicDir` carries the `CNAME` file that binds the published site to
 * `velvet.li`, because GitHub reads that name from the deployed output.
 *
 * What ships is static HTML. The page is built from the same Svelte components
 * as the onboarding, but it is rendered once here rather than in every
 * visitor's browser, so the output carries no script at all.
 */
const websiteOutDir = resolve(import.meta.dirname, "dist-website");

export default defineConfig({
  // Stated rather than inherited from NODE_ENV. Anything that builds this from
  // inside another tool passes its own environment down, and the test runner
  // sets NODE_ENV=test, which was enough to make Svelte scope its styles under
  // a different scheme than the one the render used. What gets published must
  // not depend on what happened to be exported in the shell that built it.
  mode: "production",
  base: "./",
  publicDir: resolve(import.meta.dirname, "src/website/public"),
  plugins: [
    phosphorWoff2Only,
    svelte(),
    renameHtmlEntry("website.html"),
    // After the rename, because it rewrites the entry under its final name.
    prerenderStaticEntry({
      root: import.meta.dirname,
      component: "/src/website/Website.svelte",
      mountId: "website",
      // The faces the first screenful is set in: the wordmark, the sentence
      // beneath it, and the buttons. The headings further down and the extended
      // Latin cut are left to load normally, so they do not compete with these.
      preloadFonts: [
        /^plaster-latin-400-normal-.*\.woff2$/,
        /^barlow-latin-400-normal-.*\.woff2$/,
        /^barlow-latin-600-normal-.*\.woff2$/,
      ],
    }),
  ],
  build: {
    outDir: websiteOutDir,
    emptyOutDir: true,
    rollupOptions: { input: "website.html" },
  },
});
