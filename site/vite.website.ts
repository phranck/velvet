import { resolve } from "node:path";

import { staticPage } from "./vite.static-tool.js";

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
 * `velvet.li`, because GitHub reads that name from the deployed output. This is
 * also the build that owns `dist-website` and clears it, so the pages published
 * inside that directory have to run after this one rather than before.
 *
 * What ships is static HTML. The page is built from the same Svelte components
 * as the onboarding, but it is rendered once here rather than in every
 * visitor's browser, so the output carries no script at all.
 */
export default staticPage({
  name: "website",
  root: import.meta.dirname,
  component: "/src/website/Website.svelte",
  outDir: resolve(import.meta.dirname, "dist-website"),
  publicDir: resolve(import.meta.dirname, "src/website/public"),
  emptyOutDir: true,
  // The face the opening section is named in, which no other page carries.
  extraPreloadFonts: [/^audiowide-latin-400-normal-.*\.woff2$/],
});
