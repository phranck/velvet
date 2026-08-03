import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

import {
  phosphorWoff2Only,
  prerenderStaticEntry,
  renameHtmlEntry,
} from "./vite.static-tool.js";

/**
 * Vite config for the changelog page at `velvet.li/changelog`.
 *
 * A build of its own for the same reason the references page has one: Rollup
 * splits anything two entries share into a common chunk, which put the
 * wordmark's styles into a stylesheet the prerendered start page does not load.
 * Separate builds share nothing and each page carries exactly what it needs.
 *
 * Prerendered, unlike the references page. What that page lists is read from
 * the setup service when a visitor opens it, whilst the releases here come from
 * a file in this repository and are therefore known at build time. The script
 * is removed, so this page ships no JavaScript at all.
 *
 * The output goes inside the website's directory without emptying it, so this
 * has to run after `website:build` rather than before.
 */
const changelogOutDir = resolve(import.meta.dirname, "dist-website/changelog");

export default defineConfig({
  mode: "production",
  base: "./",
  // Its own assets live beside it, and the website has already published
  // whatever belongs at the root.
  publicDir: false,
  plugins: [
    phosphorWoff2Only,
    svelte(),
    renameHtmlEntry("changelog.html"),
    // After the rename, because it rewrites the entry under its final name.
    prerenderStaticEntry({
      root: import.meta.dirname,
      component: "/src/changelog/Changelog.svelte",
      mountId: "changelog",
    }),
  ],
  build: {
    outDir: changelogOutDir,
    // The website build owns this directory and has already cleared it.
    emptyOutDir: false,
    rollupOptions: { input: "changelog.html" },
  },
});
