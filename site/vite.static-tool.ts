import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createServer, type Plugin } from "vite";

/**
 * Points the icon face at the subset built for this repository.
 *
 * The complete duotone face is 161 KB and carries about fifteen hundred icons.
 * `scripts/subset-icon-font.ts` cuts it to the ones Velvet names, which is
 * around a twentieth of that, and this rewrites the declaration so the build
 * emits the subset instead of the original. The rule also drops the other
 * formats the package offers, none of which any supported browser needs.
 *
 * The path is root-absolute because it is resolved against the Vite root
 * rather than against the stylesheet, which lives inside `node_modules`.
 */
export const phosphorWoff2Only: Plugin = {
  name: "velvet-phosphor-woff2-only",
  enforce: "pre",
  transform(source, id) {
    if (!id.includes("@phosphor-icons/web/src/duotone/style.css")) return;
    return source.replace(
      /src:\s*[\s\S]*?;\n {2}font-weight:/,
      'src: url("/src/assets/phosphor-duotone-subset.woff2") format("woff2");\n  font-weight:',
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

/**
 * Renders a Svelte entry once at build time and ships the markup, leaving no
 * script behind.
 *
 * For a page that has no state, no effects, and no handlers, shipping a bundle
 * means downloading and running fifty kilobytes of JavaScript to produce markup
 * that never changes, and it means anything which does not execute scripts, a
 * reader without JavaScript or a crawler alike, receives an empty document.
 * Rendering here keeps the page built from the same components as the rest of
 * the product whilst what is published is plain HTML.
 *
 * The component is rendered through a second Vite server in SSR mode rather
 * than from the bundle just written, because that bundle is compiled for the
 * browser. Svelte derives its scoped class names from the styles themselves, so
 * the names in this markup match the ones in the stylesheet the client build
 * emitted. `site/test/website.test.ts` asserts that, since a mismatch would
 * produce an unstyled page rather than an error.
 *
 * Only use this for a genuinely static entry. Anything interactive loses its
 * behaviour, because the script is removed rather than deferred.
 *
 * @param options.root - Vite root the component resolves against.
 * @param options.component - Component path, as Vite would import it.
 * @param options.mountId - `id` of the element the markup is placed inside.
 * @param options.preloadFonts - Matches against emitted font file names. Every
 *   match is preloaded, which is worth doing only for faces that set text in
 *   the first screenful, since preloading the rest competes with them.
 * @returns A plugin that rewrites the built HTML in place.
 */
export function prerenderStaticEntry(options: {
  root: string;
  component: string;
  mountId: string;
  preloadFonts?: readonly RegExp[];
}): Plugin {
  let outDir = "";
  /**
   * Where each source asset ended up, keyed by its absolute path.
   *
   * The server render resolves an imported asset the way the dev server would,
   * as `/@fs/` followed by an absolute path, whilst the client build emits a
   * hashed copy under `assets/`. Without this map the published page would ask
   * for a file that only exists on the machine that built it, and would print
   * that machine's directory layout while doing so.
   */
  const emittedAssets = new Map<string, string>();
  return {
    name: "velvet-prerender-static-entry",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle(_, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "asset") continue;
        for (const original of output.originalFileNames ?? []) {
          emittedAssets.set(resolve(options.root, original), output.fileName);
        }
      }
    },
    async closeBundle() {
      // This has to compile the way the client build did, because Svelte scopes
      // styles under a different scheme in development and the stylesheet
      // beside this markup came from a production build. The Svelte plugin
      // decides that from NODE_ENV rather than from the mode below, and a test
      // runner sets NODE_ENV=test, so the variable itself is set here and put
      // back afterwards.
      const callerNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const server = await createServer({
        root: options.root,
        configFile: false,
        mode: "production",
        logLevel: "silent",
        appType: "custom",
        // No compiler options here on purpose. The project's svelte.config.js
        // is what both this pass and the client build must agree on, and
        // overriding it locally is what let the two drift apart.
        plugins: [svelte()],
        server: { middlewareMode: true },
        // Server rendering never loads a browser bundle, so the dependency
        // optimiser has nothing to contribute and only races its own cache.
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      let markup: { head: string; body: string };
      try {
        const { render } = (await server.ssrLoadModule(
          "svelte/server",
        )) as typeof import("svelte/server");
        const { default: component } = await server.ssrLoadModule(
          options.component,
        );
        markup = render(component);
      } finally {
        await server.close();
        if (callerNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = callerNodeEnv;
      }

      const body = markup.body.replace(
        /\/@fs(\/[^"')\s]+)/g,
        (unresolved, absolute: string) => {
          const emitted = emittedAssets.get(absolute);
          return emitted ? `./${emitted}` : unresolved;
        },
      );
      const stray = body.match(/\/@fs\/[^"')\s]+/);
      if (stray) {
        throw new Error(
          `Rendered markup still points at a build-machine path: ${stray[0]}`,
        );
      }

      const htmlPath = resolve(outDir, "index.html");
      const html = await readFile(htmlPath, "utf8");
      const mount = new RegExp(
        `(<div id="${options.mountId}">)(</div>)`,
      );
      if (!mount.test(html)) {
        throw new Error(`No empty #${options.mountId} to render into.`);
      }

      // The faces are declared with font-display: swap, so the browser paints a
      // fallback and reflows once the real one arrives. Fetching them alongside
      // the stylesheet rather than after it is what moves that swap in front of
      // the first paint instead of after it.
      const preloads = (
        await Promise.all(
          (options.preloadFonts ?? []).map(async (pattern) =>
            (await readdir(resolve(outDir, "assets")))
              .filter((entry) => pattern.test(entry))
              .map(
                (entry) =>
                  `    <link rel="preload" as="font" type="font/woff2" crossorigin href="./assets/${entry}" />`,
              ),
          ),
        )
      ).flat();

      const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
      const rewritten = html
        .replace(mount, `$1${body}$2`)
        .replace(
          "</head>",
          `${preloads.length > 0 ? `${preloads.join("\n")}\n  ` : ""}${markup.head}</head>`,
        )
        .replace(/\s*<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g, "");
      await writeFile(htmlPath, rewritten);

      // The bundle is not merely unreferenced now, it is unreachable, so
      // leaving it in the output would publish dead weight.
      for (const [, source] of scripts) {
        await rm(resolve(outDir, source.replace(/^\.?\//, "")), { force: true });
      }
    },
  };
}
