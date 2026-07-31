import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { defineConfig } from "vite";

import {
  phosphorWoff2Only,
  renameHtmlEntry,
} from "./vite.static-tool.js";

const configuratorOutDir = resolve(import.meta.dirname, "../configurator");

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [
    phosphorWoff2Only,
    svelte(),
    renameHtmlEntry("configurator.html"),
  ],
  build: {
    outDir: configuratorOutDir,
    emptyOutDir: true,
    rollupOptions: {
      input: "configurator.html",
    },
  },
});
