import { svelte } from "@sveltejs/vite-plugin-svelte";
import { rename } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const configuratorOutDir = resolve(import.meta.dirname, "../configurator");

const phosphorWoff2Only: Plugin = {
  name: "velvet-phosphor-woff2-only",
  enforce: "pre",
  transform(source, id) {
    if (!id.includes("@phosphor-icons/web/src/duotone/style.css")) return;

    return source.replace(
      /src:\s*[\s\S]*?;\n  font-weight:/,
      'src: url("./Phosphor-Duotone.woff2") format("woff2");\n  font-weight:',
    );
  },
};

const configuratorIndexFilename: Plugin = {
  name: "velvet-configurator-index-filename",
  async closeBundle() {
    await rename(
      resolve(configuratorOutDir, "configurator.html"),
      resolve(configuratorOutDir, "index.html"),
    );
  },
};

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [
    phosphorWoff2Only,
    svelte(),
    configuratorIndexFilename,
  ],
  build: {
    outDir: configuratorOutDir,
    emptyOutDir: true,
    rollupOptions: {
      input: "configurator.html",
    },
  },
});
