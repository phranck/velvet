import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

import { phosphorWoff2Only } from "./vite.static-tool.js";

/**
 * Vite config for the Velvet status front-end.
 *
 * Relative asset URLs work for custom domains, user sites, and repository
 * subpaths without requiring consumer-specific build configuration.
 *
 * The icon face is subset and reduced to woff2 here as it is for the three
 * tools. This page is published into somebody else's repository, so every
 * kilobyte and every format it carries is served from their Pages site.
 */
export default defineConfig({
  base: "./",
  plugins: [phosphorWoff2Only, svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
