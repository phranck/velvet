import { resolve } from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

import { phosphorWoff2Only } from "./vite.static-tool.js";
import { prerenderStatusPage } from "./vite.status-prerender.js";

const root = import.meta.dirname;

/**
 * Vite config for the Velvet status front-end.
 *
 * Relative asset URLs work for custom domains, user sites, and repository
 * subpaths without requiring consumer-specific build configuration.
 *
 * The icon face is subset and reduced to woff2 here as it is for the three
 * tools. This page is published into somebody else's repository, so every
 * kilobyte and every format it carries is served from their Pages site.
 *
 * The page is rendered at build time and hydrated in the browser. `VELVET_DATA`
 * names the checked-out data directory, which `action.yml` already passes to
 * this build; without it the page ships as it did before and assembles itself.
 */
export default defineConfig({
  base: "./",
  plugins: [
    phosphorWoff2Only,
    svelte(),
    prerenderStatusPage({
      root,
      configPath: resolve(root, "public/config.json"),
      dataPath: process.env.VELVET_DATA
        ? resolve(process.cwd(), process.env.VELVET_DATA)
        : undefined,
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
