/**
 * Writing the theme's settings block into a user's own `velvet.yml`.
 *
 * `update-preference.ts` changes one scalar on one line, which is what a field
 * shared with the user's own formatting needs. This writes a whole block, which
 * is safe for exactly one reason: nothing but the configurator writes
 * `statusPage.themeSettings`, so there is no comment and no formatting choice in
 * it belonging to anybody else. Everything outside the block stays character for
 * character, and the same proof runs afterwards.
 */

import {
  changedNothingBut,
  endOfBlock,
  INDENTED,
  type FieldLocation,
} from "./configuration-edit.js";

const THEME_SETTINGS: FieldLocation = {
  block: "statusPage",
  field: "themeSettings",
};

/** A settings key as the configuration contract allows it. */
const SETTING_KEY = /^[a-z][a-zA-Z0-9]*$/u;

/**
 * Whether a value can be written between quotes without an escape.
 *
 * Single quotes take no escapes in YAML, so a newline or any other control
 * character would end the line rather than sit in the value. None of them can
 * come from one of the configurator's controls, so such a value is refused.
 *
 * @param value - What the setting holds.
 * @returns Whether it can go on the line as it stands.
 */
function isWritable(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

/** What a theme setting may hold, which the contract keeps to three kinds. */
export type ThemeSettingValue = string | number | boolean;

/**
 * Renders one setting's value as YAML.
 *
 * Strings are quoted without exception. A colour is the ordinary case here and
 * begins with `#`, which unquoted starts a comment and would silently empty the
 * value. Single quotes are used because they take no escapes, so the only
 * character needing care is the quote itself, which YAML doubles.
 *
 * @param value - What the setting holds.
 * @returns The rendered value, or `null` where it cannot be written on one line
 *   and the whole edit must therefore be refused.
 */
function renderValue(value: ThemeSettingValue): string | null {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (!isWritable(value)) return null;
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Writes `statusPage.themeSettings`.
 *
 * An empty set removes the block rather than writing an empty one, because a
 * theme with nothing set is a theme with nothing to say about it.
 *
 * @param source - The repository's current `velvet.yml`, verbatim.
 * @param settings - What has been set on the theme, keyed by feature.
 * @returns The edited source, or `null` when the edit could not be made and
 *   proven safe, in which case the caller must leave the file alone.
 */
export function setThemeSettings(
  source: string,
  settings: Readonly<Record<string, ThemeSettingValue>>,
): string | null {
  const entries = Object.entries(settings);
  if (entries.some(([key]) => !SETTING_KEY.test(key))) return null;

  const rendered: [string, string][] = [];
  for (const [key, value] of entries) {
    const text = renderValue(value);
    if (text === null) return null;
    rendered.push([key, text]);
  }

  const lines = source.split("\n");
  const pageIndex = lines.findIndex((line) => /^statusPage:/u.test(line));
  if (pageIndex === -1) return null;
  // The one-line form is refused for the same reason the scalar edit refuses
  // it: rewriting it whole would drop every sibling.
  if (!/^statusPage:[ \t]*(?:#.*)?$/u.test(lines[pageIndex]!)) return null;

  const pageEnd = endOfBlock(lines, pageIndex, "");
  const own = lines.slice(pageIndex + 1, pageEnd);
  const indent = own.find((line) => INDENTED.test(line))?.match(/^[ \t]+/u)?.[0];
  if (indent === undefined) return null;

  const keyPattern = new RegExp(`^${indent}themeSettings:`, "u");
  const keyOffset = own.findIndex((line) => keyPattern.test(line));
  const keyIndex = keyOffset === -1 ? -1 : pageIndex + 1 + keyOffset;

  const block =
    rendered.length === 0
      ? []
      : [
          `${indent}themeSettings:`,
          ...rendered.map(([key, text]) => `${indent}${indent}${key}: ${text}`),
        ];

  const edited = [...lines];
  if (keyIndex !== -1) {
    const blockEnd = endOfBlock(lines, keyIndex, indent);
    edited.splice(keyIndex, blockEnd - keyIndex, ...block);
  } else if (block.length > 0) {
    edited.splice(pageEnd, 0, ...block);
  } else {
    // Nothing to write and nothing there, so the file is already what was asked
    // for. Returned as it came rather than as a refusal.
    return source;
  }

  const written = edited.join("\n");
  const expected = rendered.length === 0 ? undefined : settings;
  return changedNothingBut(source, written, THEME_SETTINGS, (actual) =>
    sameSettings(actual, expected),
  )
    ? written
    : null;
}

/**
 * Compares two settings records by their entries.
 *
 * Read back through the parser rather than trusted, because the point is what
 * the file now says rather than what was handed in. Compared entry by entry
 * rather than by rendering both to text, so two records holding the same pairs
 * in a different order come out equal.
 *
 * @param actual - What the edited file parses to.
 * @param expected - What was asked for, or nothing where the block was removed.
 * @returns Whether they say the same thing.
 */
function sameSettings(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return actual === undefined;
  if (typeof actual !== "object" || actual === null) return false;
  const written = actual as Record<string, unknown>;
  const wanted = expected as Record<string, unknown>;
  const keys = Object.keys(wanted);
  if (Object.keys(written).length !== keys.length) return false;
  return keys.every((key) => written[key] === wanted[key]);
}
