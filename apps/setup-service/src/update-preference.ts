import { parseVelvetConfiguration } from "@velvet/contracts";

/**
 * Changing the automatic-security preference inside a user's own `velvet.yml`.
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
 */

const UPDATES_KEY = /^updates:/u;
/** `updates:` opening a block, with nothing but an optional comment after it. */
const BLOCK_STYLE = /^updates:[ \t]*(?:#.*)?$/u;
/** `updates: { ... }` complete on one line, so one line is all that changes. */
const FLOW_STYLE = /^updates:[ \t]*\{[^{}]*\}[ \t]*(#.*)?$/u;
const PREFERENCE_LINE =
  /^([ \t]+)automaticSecurityUpdates:[ \t]*[^#]*?[ \t]*(#.*)?$/u;
const INDENTED = /^[ \t]/u;
const BLANK_OR_COMMENT = /^[ \t]*(?:#.*)?$/u;

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
  const edited = applyEdit(source, enabled);
  if (edited === null) return null;
  return preservesEverythingElse(source, edited, enabled) ? edited : null;
}

function applyEdit(source: string, enabled: boolean): string | null {
  const lines = source.split("\n");
  const keyIndex = lines.findIndex((line) => UPDATES_KEY.test(line));

  if (keyIndex === -1) {
    const separator = source.length === 0 || source.endsWith("\n") ? "" : "\n";
    return `${source}${separator}updates:\n  automaticSecurityUpdates: ${enabled}\n`;
  }

  const keyLine = lines[keyIndex]!;
  const flow = keyLine.match(FLOW_STYLE);
  if (flow) {
    lines[keyIndex] = `updates: {automaticSecurityUpdates: ${enabled}}${
      flow[1] ? ` ${flow[1]}` : ""
    }`;
    return lines.join("\n");
  }
  if (!BLOCK_STYLE.test(keyLine)) return null;

  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (BLANK_OR_COMMENT.test(line)) continue;
    if (!INDENTED.test(line)) break;

    const match = line.match(PREFERENCE_LINE);
    if (!match) continue;
    const [, indent, comment] = match;
    lines[index] =
      `${indent}automaticSecurityUpdates: ${enabled}${comment ? ` ${comment}` : ""}`;
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
  enabled: boolean,
): boolean {
  const original = parseVelvetConfiguration(before);
  const updated = parseVelvetConfiguration(after);
  if (!original.success || !updated.success) return false;
  if (updated.data.updates.automaticSecurityUpdates !== enabled) return false;

  const comparable = (value: typeof original.data): string =>
    JSON.stringify({
      ...value,
      updates: { automaticSecurityUpdates: enabled },
    });
  return comparable(original.data) === comparable(updated.data);
}
