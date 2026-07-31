import { rename } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export const phosphorWoff2Only: Plugin = {
  name: "velvet-phosphor-woff2-only",
  enforce: "pre",
  transform(source, id) {
    if (!id.includes("@phosphor-icons/web/src/duotone/style.css")) return;
    return source.replace(
      /src:\s*[\s\S]*?;\n {2}font-weight:/,
      'src: url("./Phosphor-Duotone.woff2") format("woff2");\n  font-weight:',
    );
  },
};

/**
 * Renames a tool's HTML entry to `index.html` after the bundle is written.
 *
 * The output directory is taken from the resolved Vite config rather than
 * supplied, so the plugin follows an `--outDir` override instead of writing to
 * a path the build is no longer using. That is what lets a test build into a
 * temporary directory without touching the versioned artefacts.
 *
 * @param filename - Entry HTML file to rename, as named in `rollupOptions`.
 */
export function renameHtmlEntry(filename: string): Plugin {
  let outDir = "";
  return {
    name: `velvet-${filename.replace(".html", "")}-index-filename`,
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await rename(resolve(outDir, filename), resolve(outDir, "index.html"));
    },
  };
}
