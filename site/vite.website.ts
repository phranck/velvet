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
      // Every face the page is set in, because they are declared
      // `font-display: optional`: under that a file which arrives late is not
      // used at all for this load, so preloading decides whether the real face
      // is seen rather than only how soon. A face left out here is a face the
      // page never renders, however far down it would have appeared.
      // Workbench and Doto are not named here and do not need to be: both are
      // under Vite's 4kB inline limit, so they arrive inside the stylesheet as
      // data URIs rather than as files. That is a stronger guarantee than a
      // preload, since a face carried by the render-blocking stylesheet cannot
      // miss the window `font-display: optional` gives it.
      preloadFonts: [
        /^plaster-latin-400-normal-.*\.woff2$/,
        /^datatype-latin-wght-normal-.*\.woff2$/,
        /^space-mono-latin-700-normal-.*\.woff2$/,
        /^audiowide-latin-400-normal-.*\.woff2$/,
      ],
    }),
  ],
  build: {
    outDir: websiteOutDir,
    emptyOutDir: true,
    rollupOptions: { input: "website.html" },
  },
});
