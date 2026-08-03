/**
 * Turns the repository changelog into the releases the published page shows.
 *
 * What it reads is `CHANGELOG.md` at the repository root, the same document a
 * reader finds on GitHub. Nothing is copied here, so the page and the
 * repository cannot come to describe different releases.
 */

/** One entry of the changelog, being one published release. */
export interface ChangelogRelease {
  /** Heading of the entry, such as `Version 1.0.0`. */
  title: string;
  /** Everything written beneath that heading, still as Markdown. */
  notes: string;
}

/** A release heading, which is what separates one entry from the next. */
const RELEASE_HEADING = /^##\s+(.+?)\s*$/u;

/**
 * A link destination naming a file in the repository rather than a site.
 *
 * Anything carrying a scheme, a protocol-relative prefix, a leading slash, or
 * a fragment already resolves on its own and is left alone.
 */
const REPOSITORY_RELATIVE = /\]\((?![a-z][a-z0-9+.-]*:|\/\/|\/|#)([^)\s]+)\)/giu;

/** What a repository-relative link is resolved against. */
const REPOSITORY_BLOB = "https://github.com/phranck/velvet/blob/main/";

/**
 * Points a repository-relative link at the repository.
 *
 * The changelog is written to be read inside the repository, so a destination
 * such as `LICENSING.md` resolves there and nowhere else. Left alone on a
 * published page it would resolve against the page's own directory and answer
 * with nothing. It would not even appear as a broken link, because the renderer
 * accepts absolute HTTPS destinations only and degrades everything else to
 * plain text, so a reader would see the words with no way to follow them.
 *
 * @param markdown Changelog source, or one release's notes.
 * @returns The same Markdown, with every repository-relative destination
 *   rewritten to an absolute URL on the default branch.
 */
export function resolveRepositoryLinks(markdown: string): string {
  return markdown.replace(
    REPOSITORY_RELATIVE,
    (_, path: string) => `](${REPOSITORY_BLOB}${path})`,
  );
}

/**
 * Splits the changelog into its releases, in the order the file lists them.
 *
 * The document's own level-one heading, and anything written before the first
 * release, are dropped because the page supplies its own title. Each entry
 * keeps its notes as Markdown so they can be rendered by the same component the
 * Configurator uses, which never puts embedded markup into the document.
 *
 * @param source Contents of `CHANGELOG.md`.
 * @returns One entry per release. A document naming no release yields an empty
 *   list rather than a single untitled entry holding the whole file.
 */
export function parseChangelog(source: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let current: { title: string; lines: string[] } | null = null;

  const close = (): void => {
    if (!current) return;
    releases.push({
      title: current.title,
      notes: current.lines.join("\n").trim(),
    });
  };

  for (const line of resolveRepositoryLinks(source).split("\n")) {
    const heading = line.match(RELEASE_HEADING);
    if (heading) {
      close();
      current = { title: heading[1]!, lines: [] };
      continue;
    }
    current?.lines.push(line);
  }
  close();

  return releases;
}
