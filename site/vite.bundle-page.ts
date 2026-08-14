/**
 * Publishing a page in the theme an installation named.
 *
 * The build selects a theme by name, renders that theme's template with the
 * installation's data, and ships that theme's stylesheet, script and assets. A
 * theme carries its own appearance, so nothing is injected into the page.
 *
 * **The page is prerendered, and deliberately.** A prerendered page is in its
 * own colours at first paint instead of arriving in a fallback palette and
 * repainting. It costs little: a template is a pure function returning a
 * string, so the build needs no DOM and no component runtime to call it, and
 * the stylesheet reaches the browser as a link in the document rather than as
 * something a script fetches.
 */

import { readFileSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, type Plugin } from "vite";

import { bundleDataFor, layoutFor, selectBundle } from "./src/lib/bundles/host.js";
import type { BundleData } from "./src/lib/bundles/data.js";
import type { BundleManifest } from "./src/lib/bundles/manifest.js";
import { THEMES } from "./src/lib/themes.js";
import type { FetchImplementation } from "./src/lib/fetch.js";

/**
 * Answers a fetch from one file on disk, whatever is asked for.
 *
 * The loaders the page uses at runtime take a fetch, so the build drives those
 * same loaders rather than parsing and normalising the documents a second time.
 * A second implementation is a second set of defaults to keep in step.
 *
 * @param path - The file to answer with.
 * @returns A fetch returning that file, or a 404 when it is not there.
 */
export function fileAt(path: string): FetchImplementation {
  return async () => {
    try {
      return new Response(await readFile(path, "utf8"), { status: 200 });
    } catch {
      return new Response(null, { status: 404 });
    }
  };
}

/** Answers a fetch from whichever file the requested URL names. */
export const fileByUrl: FetchImplementation = async (input) => {
  try {
    return new Response(await readFile(String(input), "utf8"), { status: 200 });
  } catch {
    return new Response(null, { status: 404 });
  }
};

/**
 * Escapes a JSON payload for embedding inside a script element.
 *
 * A document sequence inside the payload would otherwise end the element early,
 * and the rest of it would be parsed as markup. The data comes from a
 * repository's own configuration and incident text, so it is not Velvet's to
 * trust.
 *
 * @param value - The state to embed.
 * @returns JSON that cannot terminate the element that carries it.
 */
export function embeddable(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}

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

    config() {
      // From the catalogue rather than from the themes on disk, because TOML is
      // Bun's to read and this config is also loaded by tools that run under
      // Node. The catalogue is written from those same files and a gate holds
      // the two together, so there is nothing to gain by parsing them twice.
      const selection = selectBundle(options.design, THEMES);
      if (!selection.ok) {
        throw new Error(`velvet: ${selection.reason}`);
      }
      manifest = selection.manifest;
      bundlePath = `/theme-bundles/${manifest.id}`;

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
