import { resolve } from "node:path";

export type StaticAssetProvider = (
  path: string,
) => Promise<Response | null>;

/**
 * The browser applications the service hosts, each under its own path.
 *
 * Each is built from the same sources as the copy committed to this repository.
 * Serving them from the service origin is what lets them use the session that
 * already exists there, rather than inventing a way to carry credentials to
 * somewhere else.
 */
/**
 * The configurator's delivered name, which is also its address.
 *
 * `config` rather than `configurator` because this name is both at once: it is
 * the directory the build writes to and the path somebody types. The address
 * was decided; the source directory says what is in it.
 */
export const CONFIGURATOR_APP = "config";

export const HOSTED_APPS = ["onboarding", CONFIGURATOR_APP] as const;

export type HostedApp = (typeof HOSTED_APPS)[number];

/**
 * One path segment, which can never be `.` or `..`.
 *
 * Both begin with a dot and this begins with a letter or a digit, so no path
 * built from these segments can climb out of where it started. The resolved
 * path is checked against its root as well, because one guard for a traversal
 * is one more than nothing and one fewer than enough.
 */
const PATH_SEGMENT = "[A-Za-z0-9][A-Za-z0-9._-]*";

/**
 * Theme files, which are the one thing served from below a subdirectory.
 *
 * A theme carries its stylesheet and script at its root and its faces under
 * `assets/fonts/`, so the flat asset form the applications use does not reach
 * them. The depth is bounded rather than open: four segments covers what a
 * theme is laid out as, and an unbounded path is an invitation to find out
 * what else is on the disk.
 */
const THEME_ASSET = new RegExp(
  `^${CONFIGURATOR_APP}/themes/${PATH_SEGMENT}(?:/${PATH_SEGMENT}){1,4}$`,
  "u",
);

/**
 * How long a path may be before it is refused unread.
 *
 * Generous for anything the build produces, and short enough that no caller
 * decides how much work a match costs.
 */
const MAX_ASSET_PATH_LENGTH = 256;

/**
 * The assets whose names carry a content hash, which is what makes them keepable.
 *
 * The build puts the hash there, so a changed file arrives under a different
 * name and a cached copy can never be the wrong one. Nothing else in the tree
 * carries one: a theme's files keep the same names from one release to the
 * next, and a document names the hashed assets and must never outlive them.
 */
const HASHED_ASSET = new RegExp(
  `^(?:${HOSTED_APPS.join("|")})/assets/${PATH_SEGMENT}$`,
  "u",
);

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/**
 * Serves the hosted browser applications from a directory.
 *
 * @param root - Directory holding one subdirectory per hosted application.
 * @param transformDocument - Applied to each `index.html` before it is served,
 *   which is how per-instance settings reach a bundle that is otherwise built
 *   once and committed. Hashed assets are served untouched, because they are
 *   cached for a year and must stay byte-identical to what was built.
 * @returns A provider answering with the file, or `null` when nothing matches.
 */
export function createStaticAssetProvider(
  root: string,
  transformDocument?: (document: string) => string,
): StaticAssetProvider {
  const absoluteRoot = resolve(root);
  return async (path) => {
    if (!allowlistedPath(path)) return null;
    const absolutePath = resolve(absoluteRoot, path);
    if (!absolutePath.startsWith(`${absoluteRoot}/`)) return null;
    const file = Bun.file(absolutePath);
    if (!(await file.exists())) return null;
    const extension = path.slice(path.lastIndexOf("."));
    const contentType = CONTENT_TYPES[extension];
    if (!contentType) return null;
    const document = path.endsWith("/index.html");
    const body = document && transformDocument
      ? transformDocument(await file.text())
      : file;
    const headers = new Headers({ "Content-Type": contentType });
    if (HASHED_ASSET.test(path)) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else if (document) {
      // A document names its own hashed assets, so it must never be cached
      // whilst they may be replaced under it.
      headers.set("Cache-Control", "no-store");
    } else {
      // A theme's files. Worth keeping, because a theme carries its own faces
      // and the monitor shows a different one whenever somebody tries another,
      // but never worth using without asking, because the names stay the same
      // across a release that changes what is behind them. The validator is
      // the file itself, so a deployment that replaces it answers with the new
      // one and a deployment that does not answers 304 with no body at all.
      headers.set("Cache-Control", "no-cache");
      headers.set("ETag", entityTag(file.size, file.lastModified));
    }
    return new Response(body, { headers });
  };
}

/**
 * What identifies one version of a file, without reading it.
 *
 * Size and modification time together, which is the pair every static server
 * uses for this. Weak, because it says two responses mean the same thing
 * rather than that they are byte for byte identical, and that is all a browser
 * needs to decide whether to reuse what it holds.
 *
 * @param size - The file's length in bytes.
 * @param lastModified - Its modification time, in milliseconds.
 * @returns The value for `ETag`, quoted and marked weak.
 */
function entityTag(size: number, lastModified: number): string {
  return `W/"${size.toString(16)}-${Math.trunc(lastModified).toString(16)}"`;
}

function allowlistedPath(path: string): boolean {
  if (path.length > MAX_ASSET_PATH_LENGTH) return false;
  if (THEME_ASSET.test(path)) return true;
  if (HASHED_ASSET.test(path)) return true;
  return HOSTED_APPS.some((app) => path === `${app}/index.html`);
}

/**
 * Maps a request path onto the file that answers it, or refuses it.
 *
 * The handler asks this rather than matching paths itself, so what a request
 * may address is described in one place. A directory path answers with that
 * application's document, which is what makes `/config/` load the
 * configurator.
 *
 * @param pathname - The request path, leading slash and all.
 * @returns The path below the public root, or `null` when nothing matches.
 */
export function hostedAssetPath(pathname: string): string | null {
  if (!pathname.startsWith("/")) return null;
  const path = pathname.slice(1);
  const candidate = path.endsWith("/") ? `${path}index.html` : path;
  return allowlistedPath(candidate) ? candidate : null;
}
