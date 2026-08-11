/**
 * Reading bundles off disk, for everything that needs to look at one before it
 * is built: the isolation gate, the conformance suite, and the build itself.
 *
 * A bundle is a directory and nothing more. There is no registry file listing
 * them, because a list kept beside the directories is a list that drifts from
 * them: adding a design is adding a directory, and that is the whole of it.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import type { BundleFile } from "../src/lib/bundles/isolation.js";
import {
  parseBundleManifest,
  type BundleManifest,
} from "../src/lib/bundles/manifest.js";

/** Where the bundles live, as an absolute path. */
export const BUNDLES_ROOT = resolve(import.meta.dirname, "../bundles");

/** The file a bundle is recognised by. */
export const MANIFEST_FILE = "bundle.json";

/**
 * Directories under the bundles root that are not bundles.
 *
 * Fixtures and plugins live beside the designs because everything about a
 * design should be in one place, and neither of them carries a manifest.
 */
const NOT_BUNDLES = new Set(["fixtures", "plugins"]);

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
]);

/** A bundle, read but not yet checked. */
export interface ReadBundle {
  /** The directory name, which is also the bundle's identifier. */
  directory: string;
  /** The absolute path to the directory. */
  path: string;
  /** The parsed manifest, where it parsed. */
  manifest: BundleManifest | null;
  /** Everything wrong with the manifest, where it did not. */
  manifestErrors: string[];
  /** Every file in the bundle, with text where the gate can read it. */
  files: BundleFile[];
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

/** Reads one bundle directory, whether or not what is in it is valid. */
export async function readBundle(path: string): Promise<ReadBundle> {
  const directory = path.split(sep).pop() ?? path;
  const paths = await collectFiles(path);
  const files: BundleFile[] = [];
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
    raw = JSON.parse(manifestFile.text);
  } catch (error) {
    return {
      directory,
      path,
      manifest: null,
      manifestErrors: [`${MANIFEST_FILE} is not valid JSON: ${String(error)}`],
      files,
    };
  }
  const result = parseBundleManifest(raw);
  return result.ok
    ? { directory, path, manifest: result.manifest, manifestErrors: [], files }
    : { directory, path, manifest: null, manifestErrors: result.errors, files };
}

/** Every bundle directory, in name order. */
export async function bundleDirectories(
  root: string = BUNDLES_ROOT,
): Promise<string[]> {
  try {
    await stat(root);
  } catch {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !NOT_BUNDLES.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** Reads every bundle under a root. */
export async function readBundles(
  root: string = BUNDLES_ROOT,
): Promise<ReadBundle[]> {
  const directories = await bundleDirectories(root);
  return Promise.all(directories.map((name) => readBundle(join(root, name))));
}
