import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createServer, type ViteDevServer } from "vite";

import { createViteTestCache } from "./vite-test-cache.js";

export interface SvelteRenderer {
  close(): Promise<void>;
  render(modulePath: string, props: Record<string, unknown>): Promise<string>;
}

export async function createSvelteRenderer(): Promise<SvelteRenderer> {
  const cache = await createViteTestCache("svelte-renderer");
  const server: ViteDevServer = await createServer({
    root: resolve(import.meta.dirname, ".."),
    cacheDir: cache.path,
    configFile: false,
    logLevel: "silent",
    appType: "custom",
    plugins: [svelte({ compilerOptions: { dev: false } })],
    server: { middlewareMode: true },
    // Server rendering never loads a browser bundle, so the dependency
    // optimiser has nothing to contribute here. Leaving it on made it race the
    // shutdown of its own cache directory, which surfaced as an intermittent
    // ENOENT on a temporary source map rather than as a test failure.
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const { render: renderOnServer } = (await server.ssrLoadModule(
    "svelte/server",
  )) as typeof import("svelte/server");

  return {
    async close() {
      await server.close();
      await cache.cleanup();
    },
    async render(modulePath, props) {
      const { default: component } = await server.ssrLoadModule(modulePath);
      return renderOnServer(component, { props }).body;
    },
  };
}
