/**
 * Writes every theme into the configurator as a document of its own.
 *
 * The monitor shows a theme beside the sidebar, and a theme brings its own
 * stylesheet, its own script and its own faces. Put into the same document as
 * the sidebar, all three would reach it. Put into a frame written as `srcdoc`,
 * the stylesheet would have to be inlined, which the service's policy refuses,
 * and the faces would have no address to resolve against.
 *
 * So each theme becomes a small site under `config/themes/<theme>/`: a
 * document, the stylesheet beside it, the script bundled next to that, and the
 * theme's own assets under the paths its stylesheet already uses. The setup
 * service serves them through the allowlist, so `style-src 'self'`,
 * `script-src 'self'` and `font-src 'self'` all hold unchanged.
 *
 * ```bash
 * bun run --cwd site configurator:themes
 * ```
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { fixtureNamed } from "../theme-bundles/fixtures/index.js";
import { themeSettingDeclarations } from "../src/lib/themes/settings.js";
import { readThemes, THEMES_ROOT } from "./themes.js";

/*
 * A theme renders times in whatever zone the machine is set to, and what this
 * writes is committed and checked against a rebuild. Left alone, a document
 * built in Berlin and one built on a runner in UTC differ by an hour and the
 * check can never pass. The frame renders again in the browser, in the reader's
 * own zone, so this decides the first paint and nothing more.
 */
process.env.TZ = "UTC";

/**
 * The fixture the monitor shows.
 *
 * The ordinary installation rather than one of the edge cases: five services,
 * three hundred days, one open incident. The others exist to catch a theme
 * misbehaving and make poor examples of what a page looks like.
 */
const MONITOR_FIXTURE = "velvet-underground";

const OUTPUT_ROOT = resolve(import.meta.dirname, "../../config/themes");

/**
 * The script each preview document runs.
 *
 * It renders once with what the manifest states, then listens for settings
 * from the configurator and writes them onto the root element. Written as
 * properties rather than as a stylesheet, because the service's policy allows
 * a style attribute and refuses an inline stylesheet, and because a property
 * set this way replaces the previous value rather than stacking on it.
 *
 * The origin is checked on every message. The frame is same-origin with its
 * embedder, so anything from elsewhere is not the configurator.
 */
function hostScript(themeScriptPath: string): string {
  return `import script from ${JSON.stringify(themeScriptPath)};

const root = document.querySelector("#velvet-root");
const data = JSON.parse(document.querySelector("#velvet-data").textContent);
const declared = JSON.parse(document.querySelector("#velvet-settings").textContent);

/** Writes one block of declarations onto the document root. */
function apply(declarations) {
  for (const [property, value] of Object.entries(declarations)) {
    document.documentElement.style.setProperty(property, value);
  }
}

apply(declared);
script(root, data);

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.type !== "velvet:settings") return;
  apply(message.declarations);
});

// Says the frame is ready for settings, so the configurator does not have to
// guess when a document it just pointed at has finished loading.
window.parent.postMessage({ type: "velvet:ready" }, window.location.origin);
`;
}

/**
 * The document a theme is previewed in.
 *
 * The same shape the conformance suite renders into, so what the monitor shows
 * and what the suite checks are the same page. The host owns everything
 * outside the root element and styles none of it beyond removing the body
 * margin.
 */
function previewDocument(
  title: string,
  markup: string,
  data: unknown,
  declarations: Record<string, string>,
): string {
  // The data rides in the document rather than being fetched, because a theme
  // is forbidden from fetching and this build has it already. The escape is
  // the one that matters: a service name holding `</script>` would otherwise
  // end the element early.
  const payload = JSON.stringify(data).replaceAll("<", "\\u003c");
  const settings = JSON.stringify(declarations).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="./theme.css" />
    <link rel="stylesheet" href="./host.css" />
  </head>
  <body>
    <div id="velvet-root">${markup}</div>
    <script type="application/json" id="velvet-data">${payload}</script>
    <script type="application/json" id="velvet-settings">${settings}</script>
    <script type="module" src="./theme.js"></script>
  </body>
</html>
`;
}

/** Everything outside the theme, which is one rule. */
const HOST_STYLESHEET = `/* The host owns what is outside the theme's root, and styles none of it. */
body {
  margin: 0;
}
`;

const fixture = fixtureNamed(MONITOR_FIXTURE);
if (!fixture) {
  throw new Error(
    `The monitor fixture ${MONITOR_FIXTURE} is not in site/theme-bundles/fixtures/.`,
  );
}

await rm(OUTPUT_ROOT, { recursive: true, force: true });
await mkdir(OUTPUT_ROOT, { recursive: true });

const themes = await readThemes(THEMES_ROOT);
let written = 0;

for (const theme of themes) {
  const manifest = theme.manifest;
  if (!manifest) {
    throw new Error(
      `${theme.directory}: ${theme.manifestErrors.join("; ") || "the manifest did not parse"}`,
    );
  }
  if (manifest.state !== "offered") continue;

  const destination = join(OUTPUT_ROOT, theme.directory);
  await mkdir(destination, { recursive: true });

  const templatePath = join(theme.path, manifest.entries.template);
  const module = (await import(templatePath)) as Record<string, unknown>;
  const template = (module.default ?? module.template) as
    | ((data: unknown) => string)
    | undefined;
  if (typeof template !== "function") {
    throw new Error(
      `${theme.directory}: ${manifest.entries.template} exports no template function.`,
    );
  }

  const built = await Bun.build({
    entrypoints: [
      await (async () => {
        const entry = join(destination, "entry.generated.ts");
        await writeFile(
          entry,
          hostScript(join(theme.path, manifest.entries.script)),
        );
        return entry;
      })(),
    ],
    target: "browser",
    format: "esm",
    minify: true,
  });
  await rm(join(destination, "entry.generated.ts"), { force: true });
  if (!built.success) {
    throw new Error(
      `${theme.directory}: the preview script does not build: ${built.logs.join("\n")}`,
    );
  }

  const declarations = Object.fromEntries(
    themeSettingDeclarations(manifest.features).map((declaration) => {
      const [property, ...rest] = declaration.replace(/;$/, "").split(":");
      return [property!.trim(), rest.join(":").trim()];
    }),
  );

  await writeFile(join(destination, "theme.js"), await built.outputs[0]!.text());
  await writeFile(
    join(destination, "theme.css"),
    await readFile(join(theme.path, manifest.entries.styles)),
  );
  await writeFile(join(destination, "host.css"), HOST_STYLESHEET);
  await writeFile(
    join(destination, "preview.html"),
    previewDocument(
      `${manifest.name} preview`,
      template(fixture.data),
      fixture.data,
      declarations,
    ),
  );

  // The theme's own files, addressed the way its stylesheet addresses them.
  await cp(join(theme.path, "assets"), join(destination, "assets"), {
    recursive: true,
  });
  written += 1;
}

console.log(
  `Wrote ${written} theme${written === 1 ? "" : "s"} into config/themes/, rendered from the ${MONITOR_FIXTURE} fixture.`,
);
