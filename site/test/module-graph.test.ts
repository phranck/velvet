import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { test } from "bun:test";

/**
 * Guards that every test file stays loadable by Bun on its own.
 *
 * Bun runs a test by transpiling its import graph directly, without Vite and
 * therefore without the Svelte plugin. A test that reaches a `.svelte` file
 * through plain imports fails to load with a parse error rather than reporting
 * an assertion, which is what #119 described. Component barrels may re-export
 * components freely, because those are only ever loaded through Vite; what must
 * not happen is a test pulling one in whilst asking for a helper beside it.
 */

const testRoot = import.meta.dirname;
const sourceRoot = resolve(testRoot, "../src");

/** Every test file in this directory, as absolute paths. */
async function collectTests(): Promise<string[]> {
  const entries = await readdir(testRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => resolve(testRoot, entry.name));
}

/**
 * A relative specifier a module actually depends on at run time.
 *
 * `import type` and `export type` are excluded, because TypeScript erases the
 * whole statement and neither Bun nor the bundler ever loads what it names.
 * Counting one is not a harmless overestimate: it reports a component as
 * reaching an application it cannot affect, which is the opposite of what the
 * table below is for. `theme-registry.ts` names `ConfiguratorTheme` that way,
 * and that alone put the configurator's configuration model, and with it the
 * service editor, in the website's graph.
 */
const IMPORT_PATTERN =
  /(?:^|[\s;}])(?:import|export)\s+(?!type\s)(?:[^'"]*?\sfrom\s)?["'](\.[^"']*)["']/gu;

/** Relative specifiers an ECMAScript module imports or re-exports. */
function relativeSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1]!);
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves one specifier the way the bundler and Bun both do.
 *
 * A `.js` specifier prefers its TypeScript source, because that is how the
 * project writes imports between TypeScript modules. An extensionless
 * specifier falls back to the directory barrel.
 *
 * @returns The resolved absolute path, or `null` when nothing matches, which
 *   only happens for a specifier no build step resolves either.
 */
async function resolveSpecifier(
  fromFile: string,
  specifier: string,
): Promise<string | null> {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = specifier.endsWith(".svelte")
    ? [base]
    : specifier.endsWith(".js")
      ? [base.replace(/\.js$/u, ".ts"), base]
      : [`${base}.ts`, `${base}.js`, resolve(base, "index.ts")];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

/**
 * Walks one test's static import graph until it reaches a Svelte component.
 *
 * @returns The path that made the graph unloadable, or `null` when the whole
 *   graph consists of modules Bun can transpile by itself.
 */
async function svelteReachedFrom(entry: string): Promise<string | null> {
  const seen = new Set<string>([entry]);
  const queue = [entry];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const source = await readFile(current, "utf8");
    for (const specifier of relativeSpecifiers(source)) {
      const resolved = await resolveSpecifier(current, specifier);
      if (resolved === null || seen.has(resolved)) continue;
      if (resolved.endsWith(".svelte")) return resolved;
      seen.add(resolved);
      queue.push(resolved);
    }
  }
  return null;
}

/**
 * Every module an entry reaches, components included.
 *
 * The walk above stops at the first Svelte file, because reaching one at all is
 * what it reports. This one goes through them, which is what makes the reach of
 * a component visible.
 */
async function modulesReachedFrom(entry: string): Promise<Set<string>> {
  const seen = new Set<string>([entry]);
  const queue = [entry];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const source = await readFile(current, "utf8");
    for (const specifier of relativeSpecifiers(source)) {
      const resolved = await resolveSpecifier(current, specifier);
      if (resolved === null || seen.has(resolved)) continue;
      seen.add(resolved);
      queue.push(resolved);
    }
  }
  return seen;
}

/**
 * The browser entries, each the root of one application.
 *
 * The four pages of the site are entries of their own rather than part of
 * `website`, because each is built by its own Vite config and publishes its own
 * document. A component reaching one of them says nothing about the others.
 */
const APPLICATIONS = {
  "status page": "main.ts",
  onboarding: "onboarding/main.ts",
  configurator: "configurator/main.ts",
  website: "website/main.ts",
  documentation: "documentation/main.ts",
  changelog: "changelog/main.ts",
  attributions: "attributions/main.ts",
  references: "references/main.ts",
} as const;

/**
 * Which applications each shared component reaches.
 *
 * Kept here so a change to it is a change somebody had to write down. Editing a
 * component otherwise gives no sign of how far the edit travels, and that has
 * cost real time: #184 corrected an attribute in `VelvetToolBrand`, which three
 * applications use, and the fix reached the website in minutes whilst the
 * onboarding waited for a manual deployment nobody had thought to run.
 *
 * A component reached by exactly one application is not shared. Those are
 * listed too, so that stays visible rather than being assumed.
 */
const EXPECTED_REACH: Readonly<Record<string, readonly string[]>> = {
  "VelvetWordmark.svelte": [
    "attributions",
    "changelog",
    "configurator",
    "documentation",
    "onboarding",
    "references",
    "status page",
    "website",
  ],
  "RainbowScale.svelte": [
    "attributions",
    "changelog",
    "configurator",
    "documentation",
    "onboarding",
    "references",
    "website",
  ],
  "VelvetToolBrand.svelte": ["configurator", "onboarding", "website"],
  // The site's own chrome, on every page of it.
  "SiteHeader.svelte": [
    "attributions",
    "changelog",
    "documentation",
    "references",
    "website",
  ],
  // The Iconsax icons the site draws. The Configurator reaches it through the
  // release-note overlay, which draws the copy and external-link marks, and
  // nothing else of its own.
  "Icon.svelte": [
    "attributions",
    "changelog",
    "configurator",
    "documentation",
    "references",
    "website",
  ],
  // The site's own footer, which holds the shared strip to the page measure.
  "SiteFooter.svelte": [
    "attributions",
    "changelog",
    "documentation",
    "references",
    "website",
  ],
  // A coloured, numbered block of code. The Configurator reaches it through
  // the release-note overlay, which renders whatever a release note contains.
  "CodeBlock.svelte": [
    "attributions",
    "changelog",
    "configurator",
    "documentation",
    "website",
  ],
  "ConsentCheckbox.svelte": ["configurator", "onboarding"],
  // The surface everything on velvet.li sits on. One component rather than one
  // per page, which is what the four pages had. The start page is not in this
  // list because its cards are step cards, which carry a wizard's body and
  // footer as well as a surface.
  card: ["attributions", "changelog", "documentation", "references"],
  // The list of places a long page holds. The reference lists its topics and
  // the changelog its releases, and both want the same panel.
  "topic-index": ["changelog", "documentation"],
  "step-card": ["onboarding", "website"],
  "page-footer": [
    "attributions",
    "changelog",
    "documentation",
    "onboarding",
    "references",
    "website",
  ],
  // Velvet's own shape: the double outline the gallery frames a card with, and
  // the tick a status page says "all systems operational" with. The onboarding
  // steps, the theme cards and the icon picker draw the outline themselves and
  // read its insets from `lib/squircle`, so the geometry is stated once even
  // where the markup is not.
  "squircle-frame": ["configurator", "references", "status page"],
  "required-field": ["configurator", "onboarding"],
  "service-editor": ["configurator", "onboarding"],
  "service-icon-picker": ["configurator", "onboarding"],
  "theme-card": ["configurator", "onboarding"],
  "Incidents.svelte": ["configurator", "status page"],
  "ServiceRow.svelte": ["configurator", "status page"],
  "StatusHero.svelte": ["configurator", "status page"],
  // Shown for the whole of an installation's first day and never again. The
  // Configurator reaches it through the preview, which draws a status page.
  "FirstRunNotice.svelte": ["configurator", "status page"],
  "StatusPage.svelte": ["configurator", "status page"],
  "UptimeBar.svelte": ["configurator", "status page"],
  service: ["configurator", "status page"],
  "review-list": ["onboarding"],
  overlay: ["configurator"],
  // A rendered Markdown document. The Configurator shows a release's notes in
  // its overlay, and three of the pages render a whole file of the repository
  // through it. The references page does not, because what it shows comes from
  // the setup service rather than from a document.
  "release-notes": ["attributions", "changelog", "configurator", "documentation"],
  update: ["configurator"],
};

/** The directory or file under `components/` a path belongs to, if any. */
function componentOf(path: string): string | null {
  const componentRoot = resolve(sourceRoot, "components");
  const rest = relative(componentRoot, path);
  if (rest.startsWith("..")) return null;
  return rest.includes("/") ? rest.slice(0, rest.indexOf("/")) : rest;
}

test("every shared component reaches the applications it is expected to", async () => {
  const reach = new Map<string, Set<string>>();
  for (const [application, entry] of Object.entries(APPLICATIONS)) {
    for (const module of await modulesReachedFrom(resolve(sourceRoot, entry))) {
      const component = componentOf(module);
      if (component === null) continue;
      if (!reach.has(component)) reach.set(component, new Set());
      reach.get(component)!.add(application);
    }
  }

  const differences: string[] = [];
  for (const component of new Set([...reach.keys(), ...Object.keys(EXPECTED_REACH)])) {
    const actual = [...(reach.get(component) ?? [])].sort();
    const expected = [...(EXPECTED_REACH[component] ?? [])].sort();
    if (actual.join() === expected.join()) continue;
    const gained = actual.filter((name) => !expected.includes(name));
    const lost = expected.filter((name) => !actual.includes(name));
    // Named rather than diffed, because the useful question when this fails is
    // which application just started or stopped depending on the component.
    differences.push(
      `${component}: ${[
        gained.length > 0 ? `now also reached by ${gained.join(", ")}` : "",
        lost.length > 0 ? `no longer reached by ${lost.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ")}`,
    );
  }

  assert.deepEqual(differences, []);
});

test("every test loads without a Svelte transform", async () => {
  const violations: string[] = [];

  for (const entry of await collectTests()) {
    const reached = await svelteReachedFrom(entry);
    if (reached !== null) {
      violations.push(
        `${relative(testRoot, entry)} reaches ${relative(sourceRoot, reached)}`,
      );
    }
  }

  assert.deepEqual(violations, []);
});

test("names every browser-driven test so the runner can leave it out", async () => {
  const files = await collectTests();
  const misnamed: string[] = [];
  for (const file of files) {
    // This file names the driver only in order to look for it, which is the one
    // mention that is not a use.
    if (file.endsWith("module-graph.test.ts")) continue;
    // Reached rather than imported directly, because a test may open its
    // browser through a helper beside it, which `configurator-update-browser`
    // does.
    const reached = await modulesReachedFrom(file);
    let drivesABrowser = false;
    for (const module_ of reached) {
      const source = await readFile(module_, "utf8");
      if (/from "playwright"|safaridriver/u.test(source)) {
        drivesABrowser = true;
        break;
      }
    }
    // A test that opens a browser is a test somebody watches, and those run on
    // a machine with a screen rather than on a runner. The name is what the
    // `test:units` and `test:browser` scripts split on, so a file driving a
    // browser without saying so lands in the group meant to need nothing but
    // Bun, and takes a browser download onto the runner with it.
    const saysSo = /(browser|safari)[^/]*\.test\.ts$/u.test(file);
    if (drivesABrowser !== saysSo) {
      misnamed.push(
        `${relative(testRoot, file)} ${drivesABrowser ? "drives a browser and does not say so" : "says it drives a browser and does not"}`,
      );
    }
  }
  assert.deepEqual(misnamed, []);
});
