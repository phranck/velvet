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

/** The four browser entries, each the root of one application. */
const APPLICATIONS = {
  "status page": "main.ts",
  onboarding: "onboarding/main.ts",
  configurator: "configurator/main.ts",
  website: "website/main.ts",
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
  "VelvetWordmark.svelte": ["configurator", "onboarding", "status page", "website"],
  "RainbowScale.svelte": ["configurator", "onboarding", "website"],
  "VelvetToolBrand.svelte": ["configurator", "onboarding", "website"],
  // The site's own chrome. The reference, changelog, and references pages use
  // it too, but they are not applications in the sense this table means and are
  // not walked from here.
  "SiteHeader.svelte": ["website"],
  // The Iconsax icons the site draws. The Configurator reaches it through the
  // release-note overlay, which draws the copy and external-link marks, and
  // nothing else of its own.
  "Icon.svelte": ["configurator", "website"],
  "ConsentCheckbox.svelte": ["configurator", "onboarding"],
  "step-card": ["onboarding", "website"],
  "page-footer": ["onboarding", "website"],
  "required-field": ["configurator", "onboarding"],
  "service-editor": ["configurator", "onboarding"],
  "service-icon-picker": ["configurator", "onboarding"],
  "theme-card": ["configurator", "onboarding"],
  "Incidents.svelte": ["configurator", "status page"],
  "ServiceRow.svelte": ["configurator", "status page"],
  "StatusHero.svelte": ["configurator", "status page"],
  "StatusPage.svelte": ["configurator", "status page"],
  "UptimeBar.svelte": ["configurator", "status page"],
  service: ["configurator", "status page"],
  "review-list": ["onboarding"],
  overlay: ["configurator"],
  "release-notes": ["configurator"],
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
