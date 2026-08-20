/**
 * Changing one scalar inside a user's own `velvet.yml`.
 *
 * The change is a text edit touching a single line, so every comment and every
 * formatting choice around it survives. `configuration-edit.ts` carries the
 * proof that nothing else moved, and `theme-settings-edit.ts` writes the one
 * thing here that is a block rather than a line.
 *
 * Three fields are written this way: the two preferences, each a boolean alone
 * in its block, and the theme a page is published in, a string among a dozen
 * siblings.
 */

import {
  BLANK_OR_COMMENT,
  changedNothingBut,
  INDENTED,
  type FieldLocation,
} from "./configuration-edit.js";

/** A scalar this module knows how to write onto one line. */
type PreferenceValue = string | boolean;

/** Where a preference sits, plus what shape of block it sits in. */
interface PreferenceLocation extends FieldLocation {
  /**
   * Whether this field is the only one its block holds.
   *
   * It decides whether `<block>: { ... }` written on one line can be edited.
   * That form is rewritten whole, which is right for a block holding this field
   * alone and loses every sibling otherwise. Where a block holds more, the edit
   * refuses the one-line form rather than emptying it.
   */
  readonly alone: boolean;
}

const AUTOMATIC_SECURITY_UPDATES: PreferenceLocation = {
  block: "updates",
  field: "automaticSecurityUpdates",
  alone: true,
};

const GALLERY_LISTING: PreferenceLocation = {
  block: "gallery",
  field: "listed",
  alone: true,
};

const STATUS_PAGE_THEME: PreferenceLocation = {
  block: "statusPage",
  field: "theme",
  alone: false,
};

/**
 * A theme name as the configuration contract allows it.
 *
 * Checked here as well as by the contract, because this value reaches a line of
 * YAML by concatenation. A name holding a colon, a quotation mark or a newline
 * would change the shape of the file rather than the value on the line, and the
 * proof afterwards would then be comparing two files that both parsed.
 */
const THEME_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

/**
 * Rewrites `updates.automaticSecurityUpdates` in a Velvet configuration.
 *
 * @param source - The repository's current `velvet.yml`, verbatim.
 * @param enabled - What the preference should become.
 * @returns The edited source, or `null` when the edit could not be made and
 *   proven safe, in which case the caller must leave the file alone.
 */
export function setAutomaticSecurityUpdates(
  source: string,
  enabled: boolean,
): string | null {
  return setPreference(source, AUTOMATIC_SECURITY_UPDATES, enabled);
}

/**
 * Rewrites `gallery.listed`, which decides whether this installation may be
 * named as a reference on the Velvet website.
 *
 * The onboarding tells whoever sets Velvet up that they can change this answer
 * later, so this is what makes that true.
 *
 * @param source - The repository's current `velvet.yml`, verbatim.
 * @param listed - What the answer should become.
 * @returns The edited source, or `null` when the edit could not be made and
 *   proven safe, in which case the caller must leave the file alone.
 */
export function setGalleryListing(
  source: string,
  listed: boolean,
): string | null {
  return setPreference(source, GALLERY_LISTING, listed);
}

/**
 * Rewrites `statusPage.theme`, which is the theme the page is published in.
 *
 * Unlike the two preferences, this field sits in a block holding a dozen others,
 * so the proof afterwards leaves those alone rather than replacing the block.
 *
 * @param source - The repository's current `velvet.yml`, verbatim.
 * @param theme - The theme's directory name.
 * @returns The edited source, or `null` when the edit could not be made and
 *   proven safe, in which case the caller must leave the file alone.
 */
export function setStatusPageTheme(
  source: string,
  theme: string,
): string | null {
  if (!THEME_NAME.test(theme)) return null;
  return setPreference(source, STATUS_PAGE_THEME, theme);
}

function setPreference(
  source: string,
  location: PreferenceLocation,
  value: PreferenceValue,
): string | null {
  const edited = applyEdit(source, location, value);
  if (edited === null) return null;
  return changedNothingBut(
    source,
    edited,
    location,
    (actual) => actual === value,
  )
    ? edited
    : null;
}

function applyEdit(
  source: string,
  location: PreferenceLocation,
  value: PreferenceValue,
): string | null {
  const { block, field } = location;
  const blockKey = new RegExp(`^${block}:`, "u");
  /** `<block>:` opening a block, with nothing but an optional comment after it. */
  const blockStyle = new RegExp(`^${block}:[ \\t]*(?:#.*)?$`, "u");
  /** `<block>: { ... }` complete on one line, so one line is all that changes. */
  const flowStyle = new RegExp(
    `^${block}:[ \\t]*\\{[^{}]*\\}[ \\t]*(#.*)?$`,
    "u",
  );
  const fieldLine = new RegExp(
    `^([ \\t]+)${field}:[ \\t]*[^#]*?[ \\t]*(#.*)?$`,
    "u",
  );

  const lines = source.split("\n");
  const keyIndex = lines.findIndex((line) => blockKey.test(line));

  if (keyIndex === -1) {
    // A block that is missing entirely can be written out, but only where this
    // field is all it holds. `statusPage` is required by the contract, so its
    // absence means a file this edit has no business completing.
    if (!location.alone) return null;
    const separator = source.length === 0 || source.endsWith("\n") ? "" : "\n";
    return `${source}${separator}${block}:\n  ${field}: ${value}\n`;
  }

  const keyLine = lines[keyIndex]!;
  const flow = location.alone ? keyLine.match(flowStyle) : null;
  if (flow) {
    lines[keyIndex] = `${block}: {${field}: ${value}}${
      flow[1] ? ` ${flow[1]}` : ""
    }`;
    return lines.join("\n");
  }
  if (!blockStyle.test(keyLine)) return null;

  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (BLANK_OR_COMMENT.test(line)) continue;
    if (!INDENTED.test(line)) break;

    const match = line.match(fieldLine);
    if (!match) continue;
    const [, indent, comment] = match;
    lines[index] = `${indent}${field}: ${value}${comment ? ` ${comment}` : ""}`;
    return lines.join("\n");
  }
  return null;
}
