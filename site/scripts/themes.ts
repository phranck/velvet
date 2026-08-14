/**
 * Reading themes off disk, for everything that needs to look at one before it
 * is built: the isolation gate, the conformance suite, and the build itself.
 *
 * A theme is a directory and nothing more. There is no registry file listing
 * them, because a list kept beside the directories is a list that drifts from
 * them: adding a theme is adding a directory, and that is the whole of it.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import type { ThemeFile } from "../src/lib/themes/isolation.js";
import {
  MANIFEST_FILE,
  parseThemeManifest,
  type ThemeManifest,
} from "../src/lib/themes/manifest.js";

/** Where the themes live, as an absolute path. */
export const THEMES_ROOT = resolve(import.meta.dirname, "../theme-bundles");

/**
 * Directories under the themes root that are not themes.
 *
 * The fixtures live beside the themes because everything a theme is rendered
 * from should be in one place, and they carry no manifest.
 */
const NOT_THEMES = new Set(["fixtures"]);

/** Extensions whose contents the gates read as text. */
const TEXT_FILES = new Set([
  ".css",
  ".ts",
  ".js",
  ".mjs",
  ".json",
  ".svg",
  ".html",
  ".txt",
  ".md",
  ".toml",
]);

/** A theme, read but not yet checked. */
export interface ReadTheme {
  /** The directory name, which is also the theme's identifier. */
  directory: string;
  /** The absolute path to the directory. */
  path: string;
  /** The parsed manifest, where it parsed. */
  manifest: ThemeManifest | null;
  /** Everything wrong with the manifest, where it did not. */
  manifestErrors: string[];
  /** Every file in the theme, with text where the gate can read it. */
  files: ThemeFile[];
}

/** Every file under a directory, relative to it and with forward slashes. */
async function collectFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      found.push(relative(root, full).split(sep).join("/"));
    }
  };
  await walk(root);
  return found.sort();
}

/** Reads one theme directory, whether or not what is in it is valid. */
export async function readTheme(path: string): Promise<ReadTheme> {
  const directory = path.split(sep).pop() ?? path;
  const paths = await collectFiles(path);
  const files: ThemeFile[] = [];
  for (const file of paths) {
    const dot = file.lastIndexOf(".");
    const extension = dot === -1 ? "" : file.slice(dot);
    files.push({
      path: file,
      text: TEXT_FILES.has(extension) ? await readFile(join(path, file), "utf8") : "",
    });
  }

  const manifestFile = files.find((file) => file.path === MANIFEST_FILE);
  if (!manifestFile) {
    return {
      directory,
      path,
      manifest: null,
      manifestErrors: [`${MANIFEST_FILE} is missing`],
      files,
    };
  }
  let raw: unknown;
  try {
    // Read here rather than in the parser, which also runs in a browser: TOML
    // is Bun's to read, and everything on the browser's side of the seam takes
    // the generated catalogue instead.
    raw = Bun.TOML.parse(manifestFile.text);
  } catch (error) {
    return {
      directory,
      path,
      manifest: null,
      manifestErrors: [`${MANIFEST_FILE} is not valid TOML: ${String(error)}`],
      files,
    };
  }
  const result = parseThemeManifest(raw, directory);
  return result.ok
    ? { directory, path, manifest: result.manifest, manifestErrors: [], files }
    : { directory, path, manifest: null, manifestErrors: result.errors, files };
}

/** Every theme directory, in name order. */
export async function themeDirectories(
  root: string = THEMES_ROOT,
): Promise<string[]> {
  try {
    await stat(root);
  } catch {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !NOT_THEMES.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** Reads every theme under a root. */
export async function readThemes(
  root: string = THEMES_ROOT,
): Promise<ReadTheme[]> {
  const directories = await themeDirectories(root);
  return Promise.all(directories.map((name) => readTheme(join(root, name))));
}
