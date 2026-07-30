import { resolve } from "node:path";

export type StaticAssetProvider = (
  path: string,
) => Promise<Response | null>;

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export function createStaticAssetProvider(root: string): StaticAssetProvider {
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
    return new Response(file, {
      headers: {
        "Cache-Control":
          path === "index.html"
            ? "no-store"
            : "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
    });
  };
}

function allowlistedPath(path: string): boolean {
  return (
    path === "index.html" ||
    /^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path)
  );
}
