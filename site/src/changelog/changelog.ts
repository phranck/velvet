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
  /** Heading of the entry without its date, such as `Version 1.0.0`. */
  title: string;
  /** A stable identifier for the entry, usable as an anchor. */
  id: string;
  /**
   * The day it was published, as written in the heading, or `undefined`.
   *
   * A release that has not been published has no date to give, so the page
   * shows its version alone rather than inventing one.
   */
  date?: string;
  /** Everything written beneath that heading, still as Markdown. */
  notes: string;
}

/**
 * A date in brackets at the end of a release heading.
 *
 * `## Version 1.0.0 (2026-08-08)` names both the release and the day it went
 * out. Written this way because the heading is what a reader sees on GitHub
 * too, so the date belongs where they already look rather than in a field only
 * this page reads.
 */
const HEADING_DATE = /^(.*?)\s*\((\d{4}-\d{2}-\d{2})\)$/u;

/**
 * Splits the changelog into its releases, in the order the file lists them.
 *
 * The document's own level-one heading, and anything written before the first
 * release, are dropped because the page supplies its own title. Each entry
 * keeps its notes as Markdown so they can be rendered by a component that never
 * puts embedded markup into the document.
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
    (section) => {
      const dated = HEADING_DATE.exec(section.title);
      return {
        title: dated ? dated[1]! : section.title,
        id: section.id,
        ...(dated ? { date: dated[2]! } : {}),
        notes: section.body,
      };
    },
  );
}
