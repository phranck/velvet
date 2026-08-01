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

const IMPORT_PATTERN =
  /(?:^|[\s;}])(?:import|export)\s(?:[^'"]*?\sfrom\s)?["'](\.[^"']*)["']/gu;

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
