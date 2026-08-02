import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { defineConfig } from "vite";

import {
  phosphorWoff2Only,
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
 */
const websiteOutDir = resolve(import.meta.dirname, "dist-website");

export default defineConfig({
  base: "./",
  publicDir: resolve(import.meta.dirname, "src/website/public"),
  plugins: [
    phosphorWoff2Only,
    svelte(),
    renameHtmlEntry("website.html"),
  ],
  build: {
    outDir: websiteOutDir,
    emptyOutDir: true,
    rollupOptions: { input: "website.html" },
  },
});
