import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

import {
  analyticsTag,
  phosphorWoff2Only,
  renameHtmlEntry,
} from "./vite.static-tool.js";

/**
 * Vite config for the references page at `velvet.li/references`.
 *
 * A build of its own rather than a second entry beside the website, because
 * Rollup splits anything two entries share into a common chunk. That put the
 * wordmark's styles in a stylesheet the prerendered start page does not load,
 * and left that page preloading a bundle it never runs. Separate builds share
 * nothing and each page carries exactly what it needs.
 *
 * The output goes inside the website's directory without emptying it, so this
 * has to run after `website:build` rather than before.
 */
const referencesOutDir = resolve(
  import.meta.dirname,
  "dist-website/references",
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
    renameHtmlEntry("references.html"),
    analyticsTag(),
  ],
  /*
    The gallery is read from the setup service, which sends no CORS header for
    an unknown origin. That is right for a public endpoint and it means a
    browser on localhost is refused, so the page could not be worked on with the
    data it actually shows. Proxied here, the request is same-origin. Only the
    dev server reads this; a published page calls the service directly.
  */
  server: {
    proxy: {
      "/api/references": {
        target: "https://setup.velvet.li",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: referencesOutDir,
    // The website build owns this directory and has already cleared it.
    emptyOutDir: false,
    rollupOptions: { input: "references.html" },
  },
});
