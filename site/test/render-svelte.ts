import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createServer, type ViteDevServer } from "vite";

export interface SvelteRenderer {
  close(): Promise<void>;
  render(modulePath: string, props: Record<string, unknown>): Promise<string>;
}

export async function createSvelteRenderer(): Promise<SvelteRenderer> {
  const server: ViteDevServer = await createServer({
    root: resolve(import.meta.dirname, ".."),
    configFile: false,
    logLevel: "silent",
    appType: "custom",
    plugins: [svelte({ compilerOptions: { dev: false } })],
    server: { middlewareMode: true },
  });
  const { render: renderOnServer } = (await server.ssrLoadModule(
    "svelte/server",
  )) as typeof import("svelte/server");

  return {
    close: () => server.close(),
    async render(modulePath, props) {
      const { default: component } = await server.ssrLoadModule(modulePath);
      return renderOnServer(component, { props }).body;
    },
  };
}
