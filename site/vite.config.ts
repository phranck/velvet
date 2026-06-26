import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

/**
 * Vite config for the MusicCloud status front-end.
 *
 * `base: "/"` because the site is served from a custom apex-style subdomain
 * (status.musiccloud.io) via GitHub Pages, not from a repo sub-path.
 * Output goes to `dist/`, which the deploy workflow publishes to `gh-pages`.
 */
export default defineConfig({
  base: "/",
  plugins: [svelte()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
