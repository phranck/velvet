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

export function renameHtmlEntry(outDir: string, filename: string): Plugin {
  return {
    name: `velvet-${filename.replace(".html", "")}-index-filename`,
    async closeBundle() {
      await rename(resolve(outDir, filename), resolve(outDir, "index.html"));
    },
  };
}
