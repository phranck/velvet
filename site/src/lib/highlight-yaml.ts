/**
 * Colouring for the YAML shown in Velvet's documentation.
 *
 * Written here rather than taken from a highlighter, for the same reason the
 * Markdown beside it is parsed here: one language is needed, the documents are
 * this project's own, and a highlighter brings a grammar engine and a set of
 * themes along to decide the colour of a handful of tokens.
 *
 * It returns data rather than markup, so the component renders every token
 * through an ordinary element. That keeps the guarantee the renderer is built
 * on, which is that no string of HTML ever reaches the DOM.
 *
 * It is deliberately line-oriented and understands the YAML these documents
 * actually use: comments, mapping keys, list markers, quoted and bare scalars,
 * numbers, booleans, and flow sequences. Block scalars, anchors, and tags
 * appear nowhere in them, and a run whose kind cannot be told is returned as
 * plain text rather than guessed at.
 */

/** What a run of characters is, which is what decides its colour. */
export type CodeTokenKind =
  | "comment"
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "punctuation"
  | "text";

/** One coloured run within a line. */
export interface CodeToken {
  kind: CodeTokenKind;
  value: string;
}

/** Leading whitespace and an optional list marker, which open most lines. */
const INDENT_AND_MARKER = /^(\s*)(-\s+)?/u;
/** A mapping key, being a name followed by a colon. */
const MAPPING_KEY = /^([A-Za-z_][\w.-]*)(\s*:)/u;
/** A quoted scalar, in either quote. No escape handling, because none is used. */
const QUOTED = /^(["'])(?:(?!\1).)*\1/u;
/** A bare number, including a decimal fraction. */
const NUMBER = /^-?\d+(?:\.\d+)?(?=[\s,\]]|$)/u;
/** The two boolean spellings these documents use. */
const BOOLEAN = /^(?:true|false)(?=[\s,\]]|$)/u;
/** A run that can hold no token of its own, taken in one piece. */
const PLAIN = /^[^["'\],\s]+/u;

/**
 * Splits one line of YAML into coloured runs.
 *
 * @param line - The line exactly as written, including its indentation.
 * @returns Its tokens in order. Concatenating their values returns the line
 *   unchanged, which is what lets the copy button read the code back out of
 *   the rendered page.
 */
export function tokenizeYamlLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let rest = line;

  const opening = rest.match(INDENT_AND_MARKER);
  if (opening?.[0]) {
    if (opening[1]) tokens.push({ kind: "text", value: opening[1] });
    if (opening[2]) tokens.push({ kind: "punctuation", value: opening[2] });
    rest = rest.slice(opening[0].length);
  }

  if (rest.startsWith("#")) {
    tokens.push({ kind: "comment", value: rest });
    return tokens;
  }

  const key = rest.match(MAPPING_KEY);
  if (key) {
    tokens.push({ kind: "key", value: key[1]! });
    tokens.push({ kind: "punctuation", value: key[2]! });
    rest = rest.slice(key[0].length);
  }

  while (rest.length > 0) {
    // Whitespace is taken on its own, because every pattern below anchors at
    // the start of what is left. Without this the space after a colon was
    // swallowed by the plain run along with the value behind it, so a number
    // or a boolean at the head of a value was never recognised as one.
    const space = rest.match(/^\s+/u);
    if (space) {
      tokens.push({ kind: "text", value: space[0] });
      rest = rest.slice(space[0].length);
      continue;
    }

    // A hash is deliberately not treated as opening a comment here. Telling a
    // trailing comment from a hash inside a value needs the quoting state, and
    // the only hashes in these documents are the ones in quoted hex colours.
    // A comment on a line of its own is caught above, before this loop.
    const quoted = rest.match(QUOTED);
    if (quoted) {
      tokens.push({ kind: "string", value: quoted[0] });
      rest = rest.slice(quoted[0].length);
      continue;
    }

    const boolean = rest.match(BOOLEAN);
    if (boolean) {
      tokens.push({ kind: "boolean", value: boolean[0] });
      rest = rest.slice(boolean[0].length);
      continue;
    }

    const number = rest.match(NUMBER);
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      rest = rest.slice(number[0].length);
      continue;
    }

    if (/^[[\],]/u.test(rest)) {
      tokens.push({ kind: "punctuation", value: rest[0]! });
      rest = rest.slice(1);
      continue;
    }

    const plain = rest.match(PLAIN)?.[0] ?? rest[0]!;
    tokens.push({ kind: "text", value: plain });
    rest = rest.slice(plain.length);
  }

  return tokens;
}

/**
 * Splits a whole block into lines of coloured runs.
 *
 * @param code - The block exactly as the document wrote it.
 * @param language - The language named on the opening fence. Anything other
 *   than YAML is returned as one plain run per line, so an unrecognised
 *   language is shown uncoloured rather than coloured wrongly.
 * @returns One entry per line, in order.
 */
export function tokenizeCode(
  code: string,
  language: string | undefined,
): CodeToken[][] {
  const lines = code.split("\n");
  if (language !== "yaml" && language !== "yml") {
    return lines.map((line) => [{ kind: "text" as const, value: line }]);
  }
  return lines.map((line) => tokenizeYamlLine(line));
}
