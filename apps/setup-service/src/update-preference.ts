import { parseVelvetConfiguration } from "@velvet/contracts";

/**
 * Changing a preference inside a user's own `velvet.yml`.
 *
 * The file belongs to the user. Parsing it and writing it back out would lose
 * every comment and every formatting choice they made, which is not an
 * acceptable side effect of flipping one checkbox. So the change is made as a
 * text edit that touches one line, and is then proven correct by comparing the
 * normalized configuration before and after.
 *
 * When the file is shaped in a way the edit does not handle, this refuses
 * rather than falling back to a rewrite. Refusing is visible and recoverable;
 * silently reformatting somebody's configuration is neither.
 *
 * Two preferences are written this way, and both live in a block of their own
 * holding a single boolean, so the mechanics are shared rather than copied.
 * Sharing them also means a correction to the parsing reaches both.
 */

const INDENTED = /^[ \t]/u;
const BLANK_OR_COMMENT = /^[ \t]*(?:#.*)?$/u;

/** Where a preference sits in the configuration. */
interface PreferenceLocation {
  /** The top-level block, such as `updates`. */
  readonly block: "updates" | "gallery";
  /** The single boolean inside it, such as `automaticSecurityUpdates`. */
  readonly field: string;
}

const AUTOMATIC_SECURITY_UPDATES: PreferenceLocation = {
  block: "updates",
  field: "automaticSecurityUpdates",
};

const GALLERY_LISTING: PreferenceLocation = {
  block: "gallery",
  field: "listed",
};

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
  return setBooleanPreference(source, AUTOMATIC_SECURITY_UPDATES, enabled);
}

/**
 * Rewrites `gallery.listed`, which decides whether this installation may be
 * named as a reference on the Velvet website.
 *
 * The onboarding tells whoever sets Velvet up that they can change this answer
 * later in their configurator, so this is what makes that true.
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
  return setBooleanPreference(source, GALLERY_LISTING, listed);
}

function setBooleanPreference(
  source: string,
  location: PreferenceLocation,
  value: boolean,
): string | null {
  const edited = applyEdit(source, location, value);
  if (edited === null) return null;
  return preservesEverythingElse(source, edited, location, value)
    ? edited
    : null;
}

function applyEdit(
  source: string,
  location: PreferenceLocation,
  value: boolean,
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
    const separator = source.length === 0 || source.endsWith("\n") ? "" : "\n";
    return `${source}${separator}${block}:\n  ${field}: ${value}\n`;
  }

  const keyLine = lines[keyIndex]!;
  const flow = keyLine.match(flowStyle);
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

/**
 * Proves the edit changed the preference and nothing else.
 *
 * Both versions are normalized through the configuration contract, and the
 * preference is then forced to the same value on both sides. Anything the edit
 * disturbed by accident, a truncated line or a broken block, shows up as a
 * difference here and causes the whole change to be refused.
 */
function preservesEverythingElse(
  before: string,
  after: string,
  location: PreferenceLocation,
  value: boolean,
): boolean {
  const original = parseVelvetConfiguration(before);
  const updated = parseVelvetConfiguration(after);
  if (!original.success || !updated.success) return false;

  const { block, field } = location;
  const read = (data: typeof updated.data): unknown =>
    (data[block] as Record<string, unknown>)[field];
  if (read(updated.data) !== value) return false;

  const comparable = (data: typeof original.data): string =>
    JSON.stringify({ ...data, [block]: { [field]: value } });
  return comparable(original.data) === comparable(updated.data);
}
