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

/** A command name at the head of a line, which is what a reader looks for. */
const COMMAND = /^[./\w-]+/u;
/** A short or long option. */
const OPTION = /^-{1,2}[A-Za-z][\w-]*/u;
/** A URL, which is the other thing worth picking out of a command line. */
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\/\S+/u;

/**
 * Splits one line of shell into coloured runs.
 *
 * It marks the three things a reader looks for in a command: what is being
 * run, what it is being given, and where it points. Everything else is plain,
 * because guessing further would colour arguments as though they meant
 * something they do not.
 *
 * @param line - The line exactly as written.
 * @returns Its tokens in order, spelling the line back unchanged.
 */
export function tokenizeShellLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let rest = line;
  let first = true;

  while (rest.length > 0) {
    const space = rest.match(/^\s+/u);
    if (space) {
      tokens.push({ kind: "text", value: space[0] });
      rest = rest.slice(space[0].length);
      continue;
    }
    if (rest.startsWith("#")) {
      tokens.push({ kind: "comment", value: rest });
      break;
    }

    const url = rest.match(URL_LIKE);
    if (url) {
      tokens.push({ kind: "string", value: url[0] });
      rest = rest.slice(url[0].length);
      continue;
    }

    const option = rest.match(OPTION);
    if (option) {
      tokens.push({ kind: "key", value: option[0] });
      rest = rest.slice(option[0].length);
      continue;
    }

    if (first) {
      const command = rest.match(COMMAND);
      if (command) {
        tokens.push({ kind: "boolean", value: command[0] });
        rest = rest.slice(command[0].length);
        first = false;
        continue;
      }
    }
    first = false;

    const plain = rest.match(/^\S+/u)?.[0] ?? rest;
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
  if (language === "yaml" || language === "yml") {
    return lines.map((line) => tokenizeYamlLine(line));
  }
  if (language === "sh" || language === "bash" || language === "shell") {
    return lines.map((line) => tokenizeShellLine(line));
  }
  return lines.map((line) => [{ kind: "text" as const, value: line }]);
}
