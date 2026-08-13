import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createServer, type Plugin } from "vite";

import type { FetchImplementation } from "./src/lib/fetch.js";
import { INITIAL_STATE_ELEMENT_ID } from "./src/lib/initial-state.js";

/**
 * Answers a fetch from one file on disk, whatever is asked for.
 *
 * The loaders the page uses at runtime take a fetch, so the build drives those
 * same loaders rather than parsing and normalising the documents a second time.
 * A second implementation is a second set of defaults to keep in step.
 *
 * Exported because the bundle page needs the same two: whichever of the two
 * pages a build produces, it reads the same files the runtime loaders would
 * have fetched.
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
 * Exported because both publish paths write a payload into a script element,
 * and which of the two runs is decided by the configuration of the repository
 * the page is built for. One definition, so a change to what is escaped cannot
 * reach one path and miss the other.
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

/**
 * Renders the status page at build time and ships the markup with the bundle.
 *
 * A published status page was a blank document that assembled itself in the
 * browser, which is the wrong shape for a page somebody opens when something is
 * already broken, often over a connection that is part of what is broken. The
 * build already holds everything the page shows, because the pipeline rebuilds
 * it whenever the data changes, so rendering here asks nothing new of the
 * pipeline and leaves nothing to go stale.
 *
 * Unlike `prerenderStaticEntry`, the script stays. The page refreshes incidents
 * on a timer, and its range control and disclosures are interactive, so this is
 * prerendering with hydration rather than a static file. The state the render
 * used is written into the document beside the markup, because the browser has
 * to start from those exact values for hydration to adopt what it is given.
 *
 * Where the configuration or the data cannot be read, the document is left as
 * it was and the page loads everything itself. That is what a first run looks
 * like, before any check has produced a document to render from.
 *
 * @param options.root - Vite root the component resolves against.
 * @param options.configPath - The generated `config.json` the Action writes.
 * @param options.dataPath - Directory holding the three v1 documents, or
 *   undefined when the build was not given one.
 * @returns A plugin that rewrites the built HTML in place.
 */
export function prerenderStatusPage(options: {
  root: string;
  configPath: string;
  dataPath: string | undefined;
}): Plugin {
  let outDir = "";
  return {
    name: "velvet-prerender-status-page",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      if (options.dataPath === undefined) {
        this.warn(
          "No data directory given, so the status page ships without a prerender.",
        );
        return;
      }

      // Compiled the way the client build was, because Svelte scopes styles
      // under a different scheme in development and the stylesheet beside this
      // markup came from a production build. The Svelte plugin decides that
      // from NODE_ENV rather than from the mode below, and a test runner sets
      // NODE_ENV=test, so the variable is set here and put back afterwards.
      const callerNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const server = await createServer({
        root: options.root,
        configFile: false,
        mode: "production",
        logLevel: "silent",
        appType: "custom",
        plugins: [svelte()],
        server: { middlewareMode: true },
        optimizeDeps: { noDiscovery: true, include: [] },
      });

      let rendered: { head: string; body: string; style: string } | undefined;
      try {
        const { render } = (await server.ssrLoadModule(
          "svelte/server",
        )) as typeof import("svelte/server");
        const { loadConfig, themeCustomProperties } =
          (await server.ssrLoadModule(
            "/src/lib/config.ts",
          )) as typeof import("./src/lib/config.js");
        const { createVelvetDataClient } = (await server.ssrLoadModule(
          "/src/lib/data-client.ts",
        )) as typeof import("./src/lib/data-client.js");
        const { default: App } = await server.ssrLoadModule("/src/App.svelte");

        const config = await loadConfig(fileAt(options.configPath));
        const snapshot = await createVelvetDataClient(
          options.dataPath,
          fileByUrl,
        ).loadSnapshot();
        const initial = {
          config,
          status: snapshot.status,
          responseTimes: snapshot.responseTimes,
          incidents: snapshot.incidents,
          range: config.defaultRange,
        };
        const markup = render(App, { props: { initial } });
        rendered = {
          head: markup.head,
          body: markup.body,
          style: Object.entries(themeCustomProperties(config))
            .map(([name, value]) => `  ${name}: ${value};`)
            .join("\n"),
        };
        rendered.body += `\n    <script type="application/json" id="${INITIAL_STATE_ELEMENT_ID}">${embeddable(initial)}</script>`;
      } catch (error) {
        // A repository whose first check has not run yet has no documents to
        // render from, which is expected rather than a build failure. The page
        // then behaves as it did before, and fetches them itself.
        this.warn(
          `The status page ships without a prerender: ${(error as Error).message}`,
        );
        return;
      } finally {
        await server.close();
        if (callerNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = callerNodeEnv;
      }

      const htmlPath = resolve(outDir, "index.html");
      const html = await readFile(htmlPath, "utf8");
      const mount = /(<div id="app"[^>]*>)(<\/div>)/;
      if (!mount.test(html)) {
        throw new Error("No empty #app to render into.");
      }
      await writeFile(
        htmlPath,
        html.replace(mount, `$1${rendered.body}$2`).replace(
          "</head>",
          // The theme reaches the document as a stylesheet rather than through
          // the script that sets it at runtime, so the prerendered page is in
          // its own colours at first paint instead of repainting once the
          // bundle has run.
          `${rendered.head}<style>\n:root {\n${rendered.style}\n}\n</style>\n  </head>`,
        ),
      );
    },
  };
}
