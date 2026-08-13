/**
 * Publishing a page in the design an installation named.
 *
 * The build Velvet ships renders `App.svelte` on the server and writes the
 * result into the document together with a `<style>` block holding a `:root`
 * declaration, whose values come from the installation's configured colours
 * merged with the shared geometry. A design is therefore a set of values
 * injected into one page.
 *
 * With bundles it is the other way round: the build selects a bundle by name,
 * renders that bundle's template with the installation's data, and ships that
 * bundle's stylesheet, script and assets. The `:root` injection goes, because a
 * bundle carries its own appearance.
 *
 * **The page is still prerendered, and deliberately.** The comment at the
 * Svelte prerender records why it matters: a prerendered page is in its own
 * colours at first paint instead of arriving in a fallback palette and
 * repainting. Prerendering a bundle costs less than prerendering the component
 * did — a template is a pure function returning a string, so the build needs no
 * DOM and no component runtime to call it — and the stylesheet reaches the
 * document as a real `<link>` the browser has already fetched by the time the
 * markup is parsed.
 *
 * **A design that cannot be served stops the build.** The reasoning is in
 * `site/src/lib/bundles/host.ts`: an operator who names a design and silently
 * gets another can never tell, and the page under their own domain is then
 * somebody else's. A stopped build leaves the last published page exactly as it
 * was, which is the safer failure for a page people open when something is
 * already broken.
 */

import { readFileSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, type Plugin } from "vite";

import { bundleDataFor, layoutFor, selectBundle } from "./src/lib/bundles/host.js";
import type { BundleData } from "./src/lib/bundles/data.js";
import type { BundleManifest } from "./src/lib/bundles/manifest.js";
import { readBundles } from "./scripts/bundles.js";
import { embeddable, fileAt, fileByUrl } from "./vite.status-prerender.js";

/** The document the design is rendered into, before the design fills it. */
export const DESIGN_ENTRY_HTML = "status-design.html";

/** The module the entry imports, whose contents depend on the design chosen. */
const VIRTUAL_ID = "virtual:velvet-design";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

/** Where the data the design was rendered from is written into the document. */
export const BUNDLE_DATA_ELEMENT_ID = "velvet-bundle-data";

/**
 * The design an installation named, read straight off `config.json`.
 *
 * Read synchronously and tolerantly, because `vite.config.ts` has to decide
 * which pair of plugins to run before anything asynchronous can happen, and a
 * repository whose configuration has not been generated yet is ordinary rather
 * than a fault.
 *
 * @param configPath - The generated `config.json`.
 * @returns The name, or undefined where none was given or nothing could be read.
 */
export function designNamedIn(configPath: string): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8")) as {
      design?: unknown;
    };
    return typeof raw.design === "string" && raw.design.trim() !== ""
      ? raw.design.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

/** Everything the plugin needs to know before it can build anything. */
export interface BundlePageOptions {
  /** Vite root the design resolves against. */
  root: string;
  /** The generated `config.json` the Action writes. */
  configPath: string;
  /** Directory holding the three v1 documents, or undefined on a first run. */
  dataPath: string | undefined;
  /** The design named, which the caller has already read off the config. */
  design: string;
}

/**
 * The documents a first run has, which is none of them.
 *
 * A bundle never fetches, so a page built before the first check has run cannot
 * fill itself in later the way the component page did. It is given empty
 * documents instead, and every design answers that with the state it shows when
 * nothing is known — which is the truth about an installation that has not
 * measured anything yet.
 */
function emptyDocuments(generatedAt: string) {
  return {
    status: {
      schemaVersion: 1 as const,
      generatedAt,
      monitoringStartedAt: generatedAt,
      services: [],
    },
    incidents: { schemaVersion: 1 as const, generatedAt, events: [] },
    responseTimes: {
      schemaVersion: 1 as const,
      generatedAt,
      monitoringStartedAt: generatedAt,
      series: [],
    },
  };
}

/**
 * Builds the published page from a bundle rather than from the component.
 *
 * @param options - The root, the configuration, the data and the design named.
 * @returns A plugin that redirects the build at the design and fills the page.
 */
export function bundleStatusPage(options: BundlePageOptions): Plugin {
  let outDir = "";
  let manifest: BundleManifest | null = null;
  let bundlePath = "";

  return {
    name: "velvet-bundle-status-page",
    enforce: "pre",

    async config() {
      const bundles = await readBundles();
      for (const bundle of bundles) {
        if (bundle.manifest === null && bundle.directory === options.design) {
          throw new Error(
            `velvet: the design "${options.design}" has a manifest this release cannot read: ${bundle.manifestErrors.join("; ")}`,
          );
        }
      }
      const selection = selectBundle(
        options.design,
        bundles.flatMap((bundle) => (bundle.manifest ? [bundle.manifest] : [])),
      );
      if (!selection.ok) {
        throw new Error(`velvet: ${selection.reason}`);
      }
      manifest = selection.manifest;
      bundlePath = `/bundles/${manifest.id}`;

      // The component page is not built at all when a design is chosen, so
      // nothing of it is published beside a design that does not use it.
      return {
        build: {
          rollupOptions: { input: resolve(options.root, DESIGN_ENTRY_HTML) },
        },
      };
    },

    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null;
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID || !manifest) return null;
      // The stylesheet is imported rather than linked by hand, so Vite emits it
      // beside the page and rewrites every `url()` in it to the asset it
      // emitted — which is how a design's own typefaces and images reach the
      // published site without the design knowing where they landed.
      return [
        `import ${JSON.stringify(`${bundlePath}/${manifest.entries.styles}`)};`,
        `import script from ${JSON.stringify(`${bundlePath}/${manifest.entries.script}`)};`,
        ``,
        `/** Hands the design the element it was rendered into, and its data. */`,
        `export function mountDesign() {`,
        `  const root = document.querySelector("#app");`,
        `  const payload = document.querySelector("#${BUNDLE_DATA_ELEMENT_ID}");`,
        `  if (!root || !payload || !payload.textContent) return;`,
        `  script(root, JSON.parse(payload.textContent));`,
        `}`,
        ``,
      ].join("\n");
    },

    async closeBundle() {
      if (!manifest) return;

      const callerNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const server = await createServer({
        root: options.root,
        configFile: false,
        mode: "production",
        logLevel: "silent",
        appType: "custom",
        server: { middlewareMode: true },
        optimizeDeps: { noDiscovery: true, include: [] },
      });

      let markup: string;
      let data: BundleData;
      try {
        const { loadConfig } = (await server.ssrLoadModule(
          "/src/lib/config.ts",
        )) as typeof import("./src/lib/config.js");
        const { createVelvetDataClient } = (await server.ssrLoadModule(
          "/src/lib/data-client.ts",
        )) as typeof import("./src/lib/data-client.js");
        const templateModule = (await server.ssrLoadModule(
          `${bundlePath}/${manifest.entries.template}`,
        )) as Record<string, unknown>;
        const template = (templateModule.default ?? templateModule.template) as
          | ((given: BundleData) => string)
          | undefined;
        if (typeof template !== "function") {
          throw new Error(
            `${manifest.entries.template} exports no template function`,
          );
        }

        const config = await loadConfig(fileAt(options.configPath));
        const documents =
          options.dataPath === undefined
            ? emptyDocuments(new Date().toISOString())
            : await createVelvetDataClient(options.dataPath, fileByUrl)
                .loadSnapshot()
                .then((snapshot) => ({
                  status: snapshot.status,
                  incidents: snapshot.incidents,
                  responseTimes: snapshot.responseTimes,
                }));

        data = bundleDataFor(config, documents);
        // An installation may have configured a layout the design does not
        // support. The design wins, because a layout it cannot draw is not a
        // layout, and it is the design an operator can see.
        data = {
          ...data,
          site: { ...data.site, layout: layoutFor(manifest, data.site.layout) },
        };
        markup = template(data);
      } finally {
        await server.close();
        if (callerNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = callerNodeEnv;
      }

      const builtPath = resolve(outDir, DESIGN_ENTRY_HTML);
      const html = await readFile(builtPath, "utf8");
      const mount = /(<div id="app"[^>]*>)(<\/div>)/;
      if (!mount.test(html)) {
        throw new Error("No empty #app to render the design into.");
      }
      await writeFile(
        builtPath,
        html.replace(
          mount,
          `$1${markup}$2\n    <script type="application/json" id="${BUNDLE_DATA_ELEMENT_ID}">${embeddable(data)}</script>`,
        ),
      );
      // The entry is named for what it is whilst the build runs, and named for
      // what a visitor asks for once it has finished.
      await rename(builtPath, resolve(outDir, "index.html"));
    },
  };
}
