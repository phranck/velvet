import { resolve } from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

import { bundleStatusPage, designNamedIn } from "./vite.bundle-page.js";
import { phosphorWoff2Only } from "./vite.static-tool.js";

const root = import.meta.dirname;
const configPath = resolve(root, "public/config.json");
const dataPath = process.env.VELVET_DATA
  ? resolve(process.cwd(), process.env.VELVET_DATA)
  : undefined;

/**
 * The theme this installation named.
 *
 * Read here rather than inside a plugin because it decides what is built at
 * all: a theme is a whole page rather than a set of values injected into one,
 * so there is nothing to build until one is named.
 */
const design = designNamedIn(configPath);
if (design === undefined) {
  throw new Error(
    "velvet: no theme is named in config.json, and a page is published in a theme. " +
      "Set statusPage.theme in velvet.yml and generate the configuration again.",
  );
}

/**
 * Vite config for the status page an installation publishes.
 *
 * Relative asset URLs work for custom domains, user sites, and repository
 * subpaths without requiring consumer-specific build configuration.
 *
 * The icon face is subset and reduced to woff2 here as it is for the three
 * tools. This page is published into somebody else's repository, so every
 * kilobyte and every format it carries is served from their Pages site.
 *
 * The page is rendered at build time: the named theme's template is called with
 * the installation's data, and its stylesheet, script and assets are shipped
 * beside the markup. `VELVET_DATA` names the checked-out data directory, which
 * `action.yml` already passes to this build.
 */
export default defineConfig({
  base: "./",
  plugins: [
    phosphorWoff2Only,
    svelte(),
    bundleStatusPage({ root, configPath, dataPath, design }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
