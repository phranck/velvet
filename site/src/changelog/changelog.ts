/**
 * Turns the repository changelog into the releases the published page shows.
 *
 * What it reads is `CHANGELOG.md` at the repository root, the same document a
 * reader finds on GitHub. Nothing is copied here, so the page and the
 * repository cannot come to describe different releases.
 */
import { splitIntoSections } from "../lib/markdown-sections.js";
import { resolveRepositoryLinks } from "../lib/repository-links.js";

/** One entry of the changelog, being one published release. */
export interface ChangelogRelease {
  /** Heading of the entry, such as `Version 1.0.0`. */
  title: string;
  /** Everything written beneath that heading, still as Markdown. */
  notes: string;
}

/**
 * Splits the changelog into its releases, in the order the file lists them.
 *
 * The document's own level-one heading, and anything written before the first
 * release, are dropped because the page supplies its own title. Each entry
 * keeps its notes as Markdown so they can be rendered by the same component the
 * Configurator uses, which never puts embedded markup into the document.
 *
 * A release is a level-two heading, which is the same cut the configuration
 * reference makes for its topics, so both read it from
 * {@link splitIntoSections}.
 *
 * @param source Contents of `CHANGELOG.md`.
 * @returns One entry per release. A document naming no release yields an empty
 *   list rather than a single untitled entry holding the whole file.
 */
export function parseChangelog(source: string): ChangelogRelease[] {
  return splitIntoSections(resolveRepositoryLinks(source)).sections.map(
    (section) => ({ title: section.title, notes: section.body }),
  );
}
