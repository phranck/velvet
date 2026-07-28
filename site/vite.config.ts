import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

/**
 * Vite config for the Velvet status front-end.
 *
 * Relative asset URLs work for custom domains, user sites, and repository
 * subpaths without requiring consumer-specific build configuration.
 */
export default defineConfig({
  base: "./",
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
