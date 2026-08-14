/**
 * Showing a theme without letting it into the document showing it.
 *
 * A theme styles its own root and nothing above it, but a preview puts two
 * themes on one screen, and the surface showing them is a third. The
 * frame is what makes "one document carries one theme" true by construction
 * rather than by convention: the theme is rendered into a document of its own,
 * with its own stylesheet, and nothing it declares can reach the page around it.
 *
 * The frame carries no script. A preview is somebody deciding what a page
 * should look like, not somebody using it, and a document that runs no script
 * cannot do anything with the surface it was embedded in.
 */

/** What a preview frame is given. */
export interface ThemePreviewOptions {
  /** Named for a reader, and for the frame's accessible name. */
  title: string;
  /** The markup the theme's template produced. */
  markup: string;
  /** The theme's whole stylesheet, as text. */
  css: string;
}

/**
 * Escapes text for a markup context.
 *
 * The title reaches both an element and an attribute, and it comes from a
 * manifest that an operator may have written.
 */
function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The whole document a preview frame shows.
 *
 * The shape is the host's: the language, the viewport, the element the theme
 * is rendered into, and nothing else. The stylesheet is inlined rather than
 * linked because a frame written as `srcdoc` has no address of its own for a
 * relative link to resolve against.
 *
 * @param options - The theme's name, its markup and its stylesheet.
 * @returns A complete document, ready to be given to `srcdoc`.
 */
export function themePreviewDocument(options: ThemePreviewOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(options.title)}</title>
<style>body { margin: 0; }</style>
<style>${options.css.replaceAll("</", "<\\/")}</style>
</head>
<body>
<div id="velvet-root">${options.markup}</div>
</body>
</html>`;
}
