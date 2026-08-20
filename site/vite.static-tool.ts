import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import {
  createServer,
  defineConfig,
  transformWithEsbuild,
  type Plugin,
  type UserConfig,
} from "vite";

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
/**
 * The analytics velvet.li carries.
 *
 * phranck's own Umami, on his own host, which is what makes the figures his
 * rather than somebody else's product. It sets no cookie and follows nobody
 * between sites, so there is nothing to ask a reader's consent for and no
 * banner to put in front of the page.
 *
 * Only on velvet.li. The onboarding and the configurator are served from
 * setup.velvet.li behind a policy that names what may load there, and neither
 * is a page somebody browses.
 */
const ANALYTICS =
  '<script defer src="https://umami.layered.work/script.js" data-website-id="1f90c085-5f8f-43b5-ae97-bf9d11c25eaf"></script>';

/**
 * Puts the analytics tag into a page that keeps its bundle.
 *
 * The prerendered pages take it in `prerenderStaticEntry`, after the step that
 * strips their bundle's own script tags, because that step would take this one
 * with it. A page that keeps its bundle has no such step, so the ordinary hook
 * is enough. Both read the one tag stated above.
 *
 * @returns A plugin that adds the tag to the document's head.
 */
export function analyticsTag(): Plugin {
  return {
    name: "velvet-analytics-tag",
    transformIndexHtml(html) {
      return html.replace("</head>", `  ${ANALYTICS}\n  </head>`);
    },
  };
}

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

      // A server render names an imported asset the way the dev server would,
      // and that is two different shapes depending on where the file lives.
      // Anything outside the Vite root arrives as `/@fs/` and an absolute path,
      // and anything inside it as a path relative to the root. Both name a file
      // that exists only on the machine that built the page, so both are
      // replaced by whatever the client build emitted for them. Only an exact
      // match is rewritten, which is what keeps an ordinary URL untouched.
      const body = markup.body.replace(
        /(?:\/@fs)?(\/[^"')\s]+)/g,
        (reference, path: string) => {
          const emitted = emittedAssets.get(
            reference.startsWith("/@fs")
              ? path
              : resolve(options.root, `.${path}`),
          );
          return emitted ? `./${emitted}` : reference;
        },
      );
      // The published page may reference the public directory, which is copied
      // verbatim, but never the sources. A leftover here means an asset was
      // rendered by its source path whilst the build emitted a hashed copy of
      // it, which publishes a page asking for a file nobody else has.
      const stray = body.match(/\/@fs\/[^"')\s]+|["'](\/src\/[^"']+)["']/);
      if (stray) {
        throw new Error(
          `Rendered markup still points at a build-machine path: ${stray[1] ?? stray[0]}`,
        );
      }

      const htmlPath = resolve(outDir, "index.html");
      const html = await readFile(htmlPath, "utf8");
      // Anything else the element carries is kept. It named the id and the
      // closing angle bracket together at first, so giving a mount point a
      // class of its own stopped the page rendering at all, with a message
      // saying the element was not there.
      const mount = new RegExp(
        `(<div id="${options.mountId}"[^>]*>)(</div>)`,
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

      // The one script a prerendered page publishes, held in a single file
      // and inlined here. Those pages ship no bundle, so nothing a component
      // renders can be wired by the component itself, and writing the same
      // script into each page's HTML is the copy this avoids.
      //
      // Minified, because it is inlined into every page rather than fetched
      // once and cached: its comments explain the code to whoever maintains it
      // and are downloaded by everybody who reads any page. Through the same
      // esbuild Vite minifies the rest of a build with, so there is one
      // minifier here rather than two.
      const pageSource = await readFile(
        resolve(options.root, "src/lib/page-script.js"),
        "utf8",
      );
      const pageScript = (
        await transformWithEsbuild(pageSource, "page-script.js", {
          minify: true,
          // It is written for browsers rather than for a bundler, and it wraps
          // itself in a function already. Nothing here is to be treated as a
          // module, which would leave it in a scope of its own and stop it
          // running at all.
          format: "iife",
        })
      ).code;

      const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
      const rewritten = html
        .replace(mount, `$1${body}$2`)
        .replace(
          "</head>",
          `${preloads.length > 0 ? `${preloads.join("\n")}\n  ` : ""}${markup.head}</head>`,
        )
        .replace(/\s*<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g, "")
        // Preloads go with it. Vite emits one per chunk the entry would have
        // loaded, and a page that runs no script has no use for any of them; a
        // reader would fetch the bundle and never execute it. This only appears
        // once a second entry shares a chunk with this one, which is why it was
        // not needed whilst the website was the only page built here.
        .replace(
          /\s*<link\b[^>]*\brel="modulepreload"[^>]*>/g,
          "",
        )
        .replace("</body>", `  <script>\n${pageScript}  </script>\n  </body>`)
        // After the bundle's own tags have gone, because the rule that removes
        // them matches any script with a `src` and would take this with them.
        .replace("</head>", `  ${ANALYTICS}\n  </head>`);
      await writeFile(htmlPath, rewritten);

      // The bundle is not merely unreferenced now, it is unreachable, so
      // leaving it in the output would publish dead weight.
      for (const [, source] of scripts) {
        await rm(resolve(outDir, source.replace(/^\.?\//, "")), { force: true });
      }
    },
  };
}

/**
 * The faces every prerendered page on velvet.li is set in.
 *
 * These preloaded nothing at all before, and under `font-display: optional` a
 * file that arrives late is not used for this load, so preloading is what
 * decides whether the real face is seen rather than only how soon. A face left
 * out here is a face the page never renders, however far down it would have
 * appeared.
 *
 * Workbench and Doto are not named and do not need to be: both are under Vite's
 * 4kB inline limit, so they arrive inside the stylesheet as data URIs rather
 * than as files. That is a stronger guarantee than a preload, since a face
 * carried by the render-blocking stylesheet cannot miss the window
 * `font-display: optional` gives it.
 *
 * The icon face blocks like the rest and must therefore be on its way with
 * them. Left out, it arrived after the first paint and moved the key it sits
 * on: measured on a cold load of the built site as the one remaining layout
 * shift, at 0.0068.
 */
export const PRERENDERED_PAGE_FONTS: readonly RegExp[] = [
  /^phosphor-duotone-subset-.*\.woff2$/,
  /^plaster-latin-400-normal-.*\.woff2$/,
  /^datatype-latin-wght-normal-.*\.woff2$/,
  /^space-mono-latin-700-normal-.*\.woff2$/,
];

/**
 * The configuration a prerendered page on velvet.li is built with.
 *
 * Each such page is a build of its own rather than a second entry beside the
 * others, because Rollup splits anything two entries share into a common chunk.
 * That put the wordmark's styles in a stylesheet the prerendered start page does
 * not load, and left that page preloading a bundle it never runs. Separate
 * builds share nothing and each page carries exactly what it needs.
 *
 * Separate builds, but one configuration: the four that existed before shared 42
 * of their 68 non-empty lines, including the comment above, which stood in the
 * repository four times. A page added by copying one of them added a fifth copy
 * before it added anything else.
 *
 * @param options.name - The page, which names its entry HTML, its mount element
 *   and, for a page under the website, its directory. `attributions` means
 *   `attributions.html`, `<div id="attributions">`, and `/attributions`.
 * @param options.root - Vite root the component resolves against.
 * @param options.component - Component path, as Vite would import it.
 * @param options.outDir - Where the build writes.
 * @param options.publicDir - Copied verbatim into the output. Absent for a page
 *   inside the website, because the website has already published whatever
 *   belongs at the root and this page's own assets live beside it.
 * @param options.emptyOutDir - Whether to clear the output first. False for a
 *   page inside the website's directory, which the website build owns and has
 *   already cleared, so such a page has to run after it rather than before.
 * @param options.extraPreloadFonts - Faces this page needs beyond the shared
 *   set, which is worth doing only for text in the first screenful.
 */
export function staticPage(options: {
  name: string;
  root: string;
  component: string;
  outDir: string;
  publicDir?: string;
  emptyOutDir?: boolean;
  extraPreloadFonts?: readonly RegExp[];
}): UserConfig {
  const entry = `${options.name}.html`;
  return defineConfig({
    // Stated rather than inherited from NODE_ENV. Anything that builds this from
    // inside another tool passes its own environment down, and the test runner
    // sets NODE_ENV=test, which was enough to make Svelte scope its styles under
    // a different scheme than the one the render used. What gets published must
    // not depend on what happened to be exported in the shell that built it.
    mode: "production",
    base: "./",
    publicDir: options.publicDir ?? false,
    plugins: [
      phosphorWoff2Only,
      svelte(),
      renameHtmlEntry(entry),
      // After the rename, because it rewrites the entry under its final name.
      prerenderStaticEntry({
        root: options.root,
        component: options.component,
        mountId: options.name,
        preloadFonts: [
          ...PRERENDERED_PAGE_FONTS,
          ...(options.extraPreloadFonts ?? []),
        ],
      }),
    ],
    build: {
      outDir: options.outDir,
      emptyOutDir: options.emptyOutDir ?? false,
      rollupOptions: { input: entry },
    },
  });
}

/**
 * Builds one of the browser applications the setup service hosts.
 *
 * These differ from {@link staticPage} in that nothing is prerendered. An
 * application decides what it shows from the session it finds and the account
 * it is signed in as, so rendering it at build time would only produce a
 * document that is wrong for everybody.
 *
 * @param name - The entry document's name, without the extension. Also the
 *   mount point the document carries and what the plugin names itself after.
 * @param outDir - Where the built copy goes, relative to the site directory.
 *   The result is committed, because the service serves it from the tree.
 * @returns The configuration, ready for `vite build --config`.
 */
export function hostedApp(options: {
  name: string;
  outDir: string;
}): UserConfig {
  const entry = `${options.name}.html`;
  return defineConfig({
    base: "./",
    publicDir: false,
    plugins: [phosphorWoff2Only, svelte(), renameHtmlEntry(entry)],
    build: {
      outDir: resolve(import.meta.dirname, options.outDir),
      emptyOutDir: true,
      // Every asset is a file, none is inlined. Vite embeds anything under
      // 4kB as a data URL, which caught Workbench at 3372 bytes and Doto at
      // 3956, and the service answers with `font-src 'self'`. A face embedded
      // that way is refused by the policy and the surface silently renders in
      // the stand-in, which is exactly the failure a named face is supposed to
      // prevent. As files they are also cached for a year rather than
      // re-parsed with the stylesheet on every visit.
      assetsInlineLimit: 0,
      // Absolute, because Rollup resolves a relative entry against the working
      // directory rather than against the Vite root. Named relatively, the
      // build only works when it is started from inside `site/`.
      rollupOptions: { input: resolve(import.meta.dirname, entry) },
    },
  });
}
