/**
 * Points a repository-relative Markdown link at the repository.
 *
 * The documents this site renders are written to be read inside the repository,
 * so a destination such as `LICENSING.md` or `../THIRD_PARTY_NOTICES.md`
 * resolves there and nowhere else. Published unchanged it would resolve against
 * the page's own directory and answer with nothing, and it would not even show
 * as a broken link, because the renderer accepts absolute HTTPS destinations
 * only and degrades everything else to plain text.
 */

/** Where a repository-relative link is resolved against. */
const REPOSITORY_BLOB = "https://github.com/phranck/velvet/blob/main/";

/**
 * A link destination naming a file in the repository rather than a site.
 *
 * Anything carrying a scheme, a protocol-relative prefix, a leading slash, or
 * a fragment already resolves on its own and is left alone.
 */
const REPOSITORY_RELATIVE = /\]\((?![a-z][a-z0-9+.-]*:|\/\/|\/|#)([^)\s]+)\)/giu;

/**
 * Rewrites every repository-relative destination in a document.
 *
 * @param markdown - The document, or one section of it.
 * @param baseDirectory - Where the document itself lives in the repository,
 *   with a trailing slash, so that `../` in a destination resolves the way it
 *   does for a reader looking at the file. An empty value means the repository
 *   root.
 * @returns The same Markdown with those destinations made absolute.
 */
export function resolveRepositoryLinks(
  markdown: string,
  baseDirectory = "",
): string {
  const base = `${REPOSITORY_BLOB}${baseDirectory}`;
  return markdown.replace(REPOSITORY_RELATIVE, (whole, path: string) => {
    try {
      return `](${new URL(path, base).href})`;
    } catch {
      // A destination the URL parser refuses is left exactly as written, so it
      // degrades to plain text rather than becoming a link to somewhere else.
      return whole;
    }
  });
}
