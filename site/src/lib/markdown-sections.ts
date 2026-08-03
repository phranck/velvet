/**
 * Splits a Markdown document at its level-two headings.
 *
 * Two pages need the same thing for different reasons. The changelog wants one
 * entry per release, and the configuration reference wants one card per topic
 * with the topic named above it. Both are the document cut at `##`, so both
 * read it from here.
 */

/** One part of a document, being everything under one level-two heading. */
export interface MarkdownSection {
  /** The heading itself, without its hashes. */
  title: string;
  /** A stable identifier for the heading, usable as an anchor. */
  id: string;
  /** Everything written beneath it, still as Markdown. */
  body: string;
}

const HEADING = /^##\s+(.+?)\s*$/u;

/**
 * Turns a heading into an identifier a link can point at.
 *
 * Lowercase, with runs of anything that is not a letter or a digit collapsed
 * into a single hyphen. The same rule the configuration format uses for service
 * identifiers, so a reader who has met one recognises the other.
 *
 * @param title - The heading text.
 * @returns The identifier, or `section` when the heading holds nothing that
 *   survives, which no heading in these documents does.
 */
export function headingId(title: string): string {
  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return id === "" ? "section" : id;
}

/**
 * Cuts a document into its level-two sections.
 *
 * @param source - The whole document.
 * @returns The lead, being whatever is written before the first heading, and
 *   one section per heading in the order the document lists them. A document
 *   with no level-two heading is all lead and no sections, rather than one
 *   untitled section holding everything.
 */
export function splitIntoSections(source: string): {
  lead: string;
  sections: MarkdownSection[];
} {
  const sections: MarkdownSection[] = [];
  const lead: string[] = [];
  let current: { title: string; lines: string[] } | null = null;

  const close = (): void => {
    if (!current) return;
    sections.push({
      title: current.title,
      id: headingId(current.title),
      body: current.lines.join("\n").trim(),
    });
  };

  for (const line of source.split("\n")) {
    const heading = line.match(HEADING);
    if (heading) {
      close();
      current = { title: heading[1]!, lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else lead.push(line);
  }
  close();

  return { lead: lead.join("\n").trim(), sections };
}
