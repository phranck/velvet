import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
import { defineConfig } from "vite";

import {
  phosphorWoff2Only,
  renameHtmlEntry,
} from "./vite.static-tool.js";

const onboardingOutDir = resolve(import.meta.dirname, "../onboarding");

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [
    phosphorWoff2Only,
    svelte(),
    renameHtmlEntry("onboarding.html"),
  ],
  build: {
    outDir: onboardingOutDir,
    emptyOutDir: true,
    rollupOptions: { input: "onboarding.html" },
  },
});
