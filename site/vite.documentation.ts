import { resolve } from "node:path";

import { staticPage } from "./vite.static-tool.js";

/**
 * Vite config for the configuration reference at `velvet.li/documentation`.
 *
 * Prerendered, because the reference comes from `documentation/configuration.md`
 * in this repository and is therefore known at build time. The script is
 * removed, so the page ships no JavaScript at all.
 *
 * `staticPage` carries what this shares with the other prerendered pages,
 * including why each of them is a build of its own.
 */
export default staticPage({
  name: "documentation",
  root: import.meta.dirname,
  component: "/src/documentation/Documentation.svelte",
  outDir: resolve(import.meta.dirname, "dist-website/documentation"),
});
