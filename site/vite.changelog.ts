import { resolve } from "node:path";

import { staticPage } from "./vite.static-tool.js";

/**
 * Vite config for the changelog page at `velvet.li/changelog`.
 *
 * Prerendered, because the releases come from a file in this repository and are
 * therefore known at build time. The script is removed, so this page ships no
 * JavaScript at all.
 *
 * `staticPage` carries what this shares with the other prerendered pages,
 * including why each of them is a build of its own.
 */
export default staticPage({
  name: "changelog",
  root: import.meta.dirname,
  component: "/src/changelog/Changelog.svelte",
  outDir: resolve(import.meta.dirname, "dist-website/changelog"),
});
