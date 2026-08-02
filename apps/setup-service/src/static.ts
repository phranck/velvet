import { resolve } from "node:path";

export type StaticAssetProvider = (
  path: string,
) => Promise<Response | null>;

/**
 * The browser applications the service hosts, each under its own path.
 *
 * Both are built from the same sources as the copies committed to this
 * repository. Serving them from the service origin is what lets them use the
 * session that already exists there, rather than inventing a way to carry
 * credentials to somewhere else.
 */
export const HOSTED_APPS = ["onboarding", "configurator"] as const;

export type HostedApp = (typeof HOSTED_APPS)[number];

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
    return new Response(body, {
      headers: {
        // A document names its own hashed assets, so it must never be cached
        // whilst they may be replaced under it.
        "Cache-Control": document
          ? "no-store"
          : "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
    });
  };
}

function allowlistedPath(path: string): boolean {
  return HOSTED_APPS.some(
    (app) =>
      path === `${app}/index.html` ||
      new RegExp(`^${app}/assets/[A-Za-z0-9][A-Za-z0-9._-]*$`, "u").test(path),
  );
}
