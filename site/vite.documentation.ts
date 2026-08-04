import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

import {
  phosphorWoff2Only,
  prerenderStaticEntry,
  renameHtmlEntry,
} from "./vite.static-tool.js";

/**
 * Vite config for the configuration reference at `velvet.li/documentation`.
 *
 * A build of its own for the reason every page here has one: Rollup splits what
 * two entries share into a common chunk, which put the wordmark's styles into a
 * stylesheet the prerendered start page does not load.
 *
 * Prerendered, because the reference comes from `documentation/configuration.md`
 * in this repository and is therefore known at build time. The script is
 * removed, so the page ships no JavaScript at all.
 *
 * The output goes inside the website's directory without emptying it, so this
 * has to run after `website:build` rather than before.
 */
const documentationOutDir = resolve(
  import.meta.dirname,
  "dist-website/documentation",
);

export default defineConfig({
  mode: "production",
  base: "./",
  // Its own assets live beside it, and the website has already published
  // whatever belongs at the root.
  publicDir: false,
  plugins: [
    phosphorWoff2Only,
    svelte(),
    renameHtmlEntry("documentation.html"),
    // After the rename, because it rewrites the entry under its final name.
    prerenderStaticEntry({
      root: import.meta.dirname,
      component: "/src/documentation/Documentation.svelte",
      mountId: "documentation",
      // The faces the page is set in, the heading face included. These
      // preloaded nothing at all before, and under `font-display: optional` a
      // file that arrives late is not used for this load, so preloading is what
      // decides whether the real face is seen.
      preloadFonts: [
        /^plaster-latin-400-normal-.*\.woff2$/,
        /^barlow-latin-400-normal-.*\.woff2$/,
        /^barlow-latin-600-normal-.*\.woff2$/,
        /^barlow-condensed-latin-600-normal-.*\.woff2$/,
      ],
    }),
  ],
  build: {
    outDir: documentationOutDir,
    // The website build owns this directory and has already cleared it.
    emptyOutDir: false,
    rollupOptions: { input: "documentation.html" },
  },
});
