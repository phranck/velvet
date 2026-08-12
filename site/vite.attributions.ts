import { resolve } from "node:path";

import { staticPage } from "./vite.static-tool.js";

/**
 * Vite config for the attributions page at `velvet.li/attributions`.
 *
 * Prerendered, unlike the references page. What that page lists is read from
 * the setup service when a visitor opens it, whilst the notices here come from
 * a file in this repository and are therefore known at build time. The script
 * is removed, so this page ships no JavaScript at all.
 *
 * `staticPage` carries what this shares with the other prerendered pages,
 * including why each of them is a build of its own.
 */
export default staticPage({
  name: "attributions",
  root: import.meta.dirname,
  component: "/src/attributions/Attributions.svelte",
  outDir: resolve(import.meta.dirname, "dist-website/attributions"),
});
