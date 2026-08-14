/**
 * Release-note rendering that cannot produce markup.
 *
 * The parser accepts Markdown and returns data, never a string of HTML. The
 * component that displays it renders each part through normal Svelte elements,
 * so there is no `{@html}` anywhere in the path and embedded markup has no
 * route to the DOM. That is a structural guarantee rather than a filter, which
 * is why there is no sanitizer that could be bypassed.
 */

/** Longest document that will be rendered. Anything beyond it is dropped. */
const MAX_SOURCE_LENGTH = 65_536;
/** Upper bound on rendered blocks, so a hostile document cannot exhaust the page. */
const MAX_BLOCKS = 500;
/** Upper bound on inline parts per block, for the same reason. */
const MAX_INLINE_PARTS = 200;
/** Upper bound on body rows in one table, for the same reason. */
const MAX_TABLE_ROWS = 200;
/** Upper bound on cells in one row, so a wide row cannot exhaust the page either. */
const MAX_TABLE_COLUMNS = 12;

/** A run of text inside a block. */
export type ReleaseNotesInline =
  | { kind: "text"; value: string }
  | { kind: "emphasis"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; value: string; href: string };

/** A heading level a rendered block may use. Never 1, whatever the source says. */
export type ReleaseNotesHeadingLevel = 2 | 3 | 4 | 5 | 6;

/**
 * One rendered block.
 *
 * Headings never reach level 1, because the page around them always supplies
 * that one and a document cannot be allowed to break its outline.
 */
export type ReleaseNotesBlock =
  | {
      kind: "heading";
      level: ReleaseNotesHeadingLevel;
      content: ReleaseNotesInline[];
    }
  | { kind: "paragraph"; content: ReleaseNotesInline[] }
  | { kind: "list"; ordered: boolean; items: ReleaseNotesInline[][] }
  | {
      kind: "table";
      headers: ReleaseNotesInline[][];
      rows: ReleaseNotesInline[][][];
    }
  | { kind: "code"; value: string; language?: string };

/**
 * How the levels a document writes are turned into the levels it renders at.
 *
 * `flattened` puts everything into two levels, which suits a short document
 * shown inside something that already has a heading of its own, such as an
 * overlay. `outline` keeps the document's own structure and only refuses level
 * 1, which is what a reference page needs to stay navigable.
 */
export type ReleaseNotesHeadings = "flattened" | "outline";

export interface ReleaseNotesOptions {
  /** Defaults to `flattened`, which is what the overlay has always received. */
  headings?: ReleaseNotesHeadings;
}

const HEADING = /^(#{1,6})\s+(.*)$/u;
const UNORDERED_ITEM = /^[-*]\s+(.*)$/u;
const ORDERED_ITEM = /^\d+[.)]\s+(.*)$/u;
/** A table row, which is any line fenced by pipes. */
const TABLE_ROW = /^\|(.*)\|$/u;
/** The row of dashes under a header, which is what makes the table a table. */
const TABLE_DELIMITER = /^\|(?:\s*:?-{3,}:?\s*\|)+$/u;
const INLINE =
  /\[([^\]\n]{1,200})\]\(([^)\s]{1,2048})\)|\*\*([^*\n]{1,500})\*\*|\*([^*\n]{1,500})\*|`([^`\n]{1,500})`/u;

/**
 * Turns a heading's own depth into the level it renders at.
 *
 * @param depth - Number of hashes the document wrote.
 * @param headings - Which of the two arrangements the caller asked for.
 * @returns A level of 2 or deeper, never 1.
 */
function headingLevel(
  depth: number,
  headings: ReleaseNotesHeadings,
): ReleaseNotesHeadingLevel {
  if (headings === "flattened") return depth <= 1 ? 2 : 3;
  return Math.min(Math.max(depth, 2), 6) as ReleaseNotesHeadingLevel;
}

/**
 * Parses Markdown into a renderable structure.
 *
 * @param source - Markdown from a release manifest or a documentation file.
 * @param options - See {@link ReleaseNotesOptions}. Omitting it renders exactly
 *   as this function always has.
 * @returns Blocks in document order, bounded in count and size. An empty or
 *   content-free document yields an empty list.
 */
export function parseReleaseNotes(
  source: string,
  options: ReleaseNotesOptions = {},
): ReleaseNotesBlock[] {
  const headings = options.headings ?? "flattened";
  const lines = source.slice(0, MAX_SOURCE_LENGTH).split("\n");
  const blocks: ReleaseNotesBlock[] = [];
  let index = 0;

  while (index < lines.length && blocks.length < MAX_BLOCKS) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      // Whatever the opening fence names, which decides how the block is
      // coloured. An unnamed or unrecognised language is shown uncoloured
      // rather than coloured wrongly.
      const language = line.trimStart().slice(3).trim().toLowerCase();
      const collected: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trimStart().startsWith("```")) {
        collected.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({
        kind: "code",
        value: collected.join("\n"),
        ...(language ? { language } : {}),
      });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: headingLevel(heading[1]!.length, headings),
        content: parseInline(heading[2] ?? ""),
      });
      index += 1;
      continue;
    }

    const tableBlock = collectTable(lines, index);
    if (tableBlock) {
      blocks.push(tableBlock.block);
      index = tableBlock.next;
      continue;
    }

    const listBlock = collectList(lines, index);
    if (listBlock) {
      blocks.push(listBlock.block);
      index = listBlock.next;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (
        current.trim() === "" ||
        HEADING.test(current) ||
        UNORDERED_ITEM.test(current.trim()) ||
        ORDERED_ITEM.test(current.trim()) ||
        // Only a row that actually opens a table, which is one followed by the
        // row of dashes. A line merely beginning with a pipe is prose and stays
        // in the paragraph, and treating it as a boundary here left the index
        // where it was whilst nothing consumed the line.
        collectTable(lines, index) !== null ||
        current.trimStart().startsWith("```")
      ) {
        break;
      }
      paragraph.push(current.trim());
      index += 1;
    }
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", content: parseInline(paragraph.join(" ")) });
    }
  }
  return blocks;
}

/**
 * Splits one table row into its cells.
 *
 * The outer pipes are the fence rather than cell boundaries, so they are
 * stripped before splitting. An escaped pipe is not supported and is not worth
 * supporting, because a cell needing one would be unreadable in the source too.
 *
 * @param row - One line already known to be fenced by pipes.
 * @returns The cells, trimmed, bounded in number.
 */
function tableCells(row: string): string[] {
  return (row.match(TABLE_ROW)?.[1] ?? "")
    .split("|")
    .slice(0, MAX_TABLE_COLUMNS)
    .map((cell) => cell.trim());
}

/**
 * Reads a table, which is a header row, a row of dashes, and the body.
 *
 * The row of dashes is what distinguishes a table from a paragraph that happens
 * to begin with a pipe, so a header without one is not a table and is left to
 * whatever handles the line next.
 *
 * @param lines - Every line of the document.
 * @param start - Index of the candidate header row.
 * @returns The block and the index after it, or `null` when this is not a
 *   table.
 */
function collectTable(
  lines: readonly string[],
  start: number,
): { block: ReleaseNotesBlock; next: number } | null {
  const header = (lines[start] ?? "").trim();
  const delimiter = (lines[start + 1] ?? "").trim();
  if (!TABLE_ROW.test(header) || !TABLE_DELIMITER.test(delimiter)) return null;

  const headers = tableCells(header).map((cell) => parseInline(cell));
  const rows: ReleaseNotesInline[][][] = [];
  let index = start + 2;
  while (index < lines.length && rows.length < MAX_TABLE_ROWS) {
    const current = (lines[index] ?? "").trim();
    if (!TABLE_ROW.test(current) || TABLE_DELIMITER.test(current)) break;
    rows.push(tableCells(current).map((cell) => parseInline(cell)));
    index += 1;
  }

  return { block: { kind: "table", headers, rows }, next: index };
}

function collectList(
  lines: readonly string[],
  start: number,
): { block: ReleaseNotesBlock; next: number } | null {
  const first = (lines[start] ?? "").trim();
  const ordered = ORDERED_ITEM.test(first);
  if (!ordered && !UNORDERED_ITEM.test(first)) return null;

  const marker = ordered ? ORDERED_ITEM : UNORDERED_ITEM;
  const items: string[] = [];
  let index = start;
  while (index < lines.length && items.length < MAX_INLINE_PARTS) {
    const raw = lines[index] ?? "";
    const match = raw.trim().match(marker);
    if (match) {
      items.push(match[1] ?? "");
      index += 1;
      continue;
    }
    // A wrapped item. Markdown continues an item across the lines that follow
    // it whilst they are indented and carry no marker of their own, and a
    // document written to a column width is full of them. Without this the
    // list ended at the first wrap and the remainder of the sentence became a
    // paragraph beneath it, which is how the changelog first rendered.
    if (
      items.length > 0 &&
      raw.trim() !== "" &&
      /^\s/u.test(raw) &&
      !raw.trimStart().startsWith("```")
    ) {
      items[items.length - 1] += ` ${raw.trim()}`;
      index += 1;
      continue;
    }
    break;
  }
  return {
    block: { kind: "list", ordered, items: items.map((item) => parseInline(item)) },
    next: index,
  };
}

function parseInline(source: string): ReleaseNotesInline[] {
  const parts: ReleaseNotesInline[] = [];
  let rest = source;

  while (rest.length > 0 && parts.length < MAX_INLINE_PARTS) {
    const match = rest.match(INLINE);
    if (!match || match.index === undefined) break;

    if (match.index > 0) {
      parts.push({ kind: "text", value: rest.slice(0, match.index) });
    }
    const [, linkText, linkHref, strong, emphasis, code] = match;
    if (linkText !== undefined && linkHref !== undefined) {
      const href = safeHref(linkHref);
      parts.push(
        href === null
          ? { kind: "text", value: linkText }
          : { kind: "link", value: linkText, href },
      );
    } else if (strong !== undefined) {
      parts.push({ kind: "strong", value: strong });
    } else if (emphasis !== undefined) {
      parts.push({ kind: "emphasis", value: emphasis });
    } else if (code !== undefined) {
      parts.push({ kind: "code", value: code });
    }
    rest = rest.slice(match.index + match[0].length);
  }

  if (rest.length > 0) parts.push({ kind: "text", value: rest });
  return parts;
}

/**
 * Accepts a link destination only when it is unambiguously plain HTTPS.
 *
 * Anything else, including `http`, protocol-relative URLs, and every scheme
 * that can execute, degrades to plain text rather than being rewritten. A
 * reader still sees the label, and no navigable target is invented for them.
 *
 * @param value - Raw destination from the document.
 * @returns The destination, or `null` when it must not become a link.
 */
function safeHref(value: string): string | null {
  if (!value.toLowerCase().startsWith("https://")) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
