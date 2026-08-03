/**
 * Turns the repository changelog into the releases the published page shows.
 *
 * What it reads is `CHANGELOG.md` at the repository root, the same document a
 * reader finds on GitHub. Nothing is copied here, so the page and the
 * repository cannot come to describe different releases.
 */
import { resolveRepositoryLinks } from "../lib/repository-links.js";

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
