import { resolve } from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

import { bundleStatusPage, designNamedIn } from "./vite.bundle-page.js";
import { phosphorWoff2Only } from "./vite.static-tool.js";
import { prerenderStatusPage } from "./vite.status-prerender.js";

const root = import.meta.dirname;
const configPath = resolve(root, "public/config.json");
const dataPath = process.env.VELVET_DATA
  ? resolve(process.cwd(), process.env.VELVET_DATA)
  : undefined;

/**
 * The design this installation named, where it named one.
 *
 * Read here rather than inside a plugin because it decides which page is built
 * at all: a design is a whole page rather than a set of values injected into
 * one, so the component and the design are alternatives rather than layers.
 */
const design = designNamedIn(configPath);

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
 *
 * An installation that names a design in `velvet.yml` gets that bundle instead:
 * its template rendered at build time, its stylesheet and script shipped, and
 * none of the component page built at all. The two prerenders are alternatives,
 * so exactly one of them runs.
 */
export default defineConfig({
  base: "./",
  plugins: [
    phosphorWoff2Only,
    svelte(),
    ...(design === undefined
      ? [prerenderStatusPage({ root, configPath, dataPath })]
      : [bundleStatusPage({ root, configPath, dataPath, design })]),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
