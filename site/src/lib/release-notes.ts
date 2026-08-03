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

/** A run of text inside a block. */
export type ReleaseNotesInline =
  | { kind: "text"; value: string }
  | { kind: "emphasis"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "code"; value: string }
  | { kind: "link"; value: string; href: string };

/**
 * One rendered block.
 *
 * Headings start at level 2 because the overlay already provides the only
 * level-1 heading, so a release note cannot break the document outline.
 */
export type ReleaseNotesBlock =
  | { kind: "heading"; level: 2 | 3; content: ReleaseNotesInline[] }
  | { kind: "paragraph"; content: ReleaseNotesInline[] }
  | { kind: "list"; ordered: boolean; items: ReleaseNotesInline[][] }
  | { kind: "code"; value: string };

const HEADING = /^(#{1,6})\s+(.*)$/u;
const UNORDERED_ITEM = /^[-*]\s+(.*)$/u;
const ORDERED_ITEM = /^\d+[.)]\s+(.*)$/u;
const INLINE =
  /\[([^\]\n]{1,200})\]\(([^)\s]{1,2048})\)|\*\*([^*\n]{1,500})\*\*|\*([^*\n]{1,500})\*|`([^`\n]{1,500})`/u;

/**
 * Parses release notes into a renderable structure.
 *
 * @param source - Markdown from a release manifest.
 * @returns Blocks in document order, bounded in count and size. An empty or
 *   content-free document yields an empty list.
 */
export function parseReleaseNotes(source: string): ReleaseNotesBlock[] {
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
      const collected: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").trimStart().startsWith("```")) {
        collected.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", value: collected.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      // A document's own level-1 heading becomes level 2, and everything
      // deeper collapses to level 3, so the outline stays shallow and valid.
      blocks.push({
        kind: "heading",
        level: heading[1]!.length <= 1 ? 2 : 3,
        content: parseInline(heading[2] ?? ""),
      });
      index += 1;
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
