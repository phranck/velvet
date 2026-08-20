/**
 * Proving that a change to a user's own `velvet.yml` changed one thing.
 *
 * The file belongs to the user. Parsing it and writing it back out would lose
 * every comment and every formatting choice they made, so every change is a
 * text edit, and a text edit needs proving. That proof is the same whatever was
 * edited, so it lives here and the edits share it: a scalar on one line in
 * `update-preference.ts`, a whole block in `theme-settings-edit.ts`.
 *
 * When the file is shaped in a way an edit does not handle, the edit refuses
 * rather than falling back to a rewrite. Refusing is visible and recoverable;
 * silently reformatting somebody's configuration is neither.
 */

import { parseVelvetConfiguration } from "@velvet/contracts";

/** A line inside a block, as opposed to one starting a new top-level key. */
export const INDENTED = /^[ \t]/u;

/** A line carrying nothing but whitespace or a comment. */
export const BLANK_OR_COMMENT = /^[ \t]*(?:#.*)?$/u;

/** Where a change sits in the configuration. */
export interface FieldLocation {
  /** The top-level block, such as `updates`. */
  readonly block: "updates" | "gallery" | "statusPage";
  /** The field inside it, such as `automaticSecurityUpdates`. */
  readonly field: string;
}

/**
 * Proves the edit changed the named field and nothing else.
 *
 * Both versions are normalized through the configuration contract, and the field
 * is then forced to the same value on both sides. Anything the edit disturbed by
 * accident, a truncated line or a broken block, shows up as a difference here
 * and causes the whole change to be refused.
 *
 * Only that one field is forced to agree, and the rest of its block is left as
 * each side has it. Replacing the whole block would hide a sibling the edit
 * disturbed, which matters for `statusPage`: it carries a dozen fields where the
 * two preferences carry one each.
 *
 * @param before - The file as it was.
 * @param after - The file as the edit left it.
 * @param location - Which field the edit was allowed to change.
 * @param arrived - Whether what the file now says at that field is what was
 *   asked for. Given as a test rather than a value because a block is compared
 *   by its entries whilst a scalar is compared by identity.
 * @returns Whether the edit is safe to keep.
 */
export function changedNothingBut(
  before: string,
  after: string,
  location: FieldLocation,
  arrived: (actual: unknown) => boolean,
): boolean {
  const original = parseVelvetConfiguration(before);
  const updated = parseVelvetConfiguration(after);
  if (!original.success || !updated.success) return false;

  const { block, field } = location;
  const read = (data: typeof updated.data): unknown =>
    (data[block] as Record<string, unknown> | undefined)?.[field];
  if (!arrived(read(updated.data))) return false;

  // Both sides come through the same parser, so their keys are in the same
  // order and comparing the rendered text is comparing the data. Nulling the
  // field on both sides is what excludes it from the comparison.
  const comparable = (data: typeof original.data): string =>
    JSON.stringify({
      ...data,
      [block]: { ...(data[block] as Record<string, unknown>), [field]: null },
    });
  return comparable(original.data) === comparable(updated.data);
}

/**
 * Finds where a block's own lines end.
 *
 * A block runs from the line after its key to the last line indented deeper than
 * the key. Blank lines and comments inside it belong to it, whilst the first
 * line at the key's own indentation or shallower ends it. Trailing blank lines
 * are left outside, so replacing a block does not eat the gap somebody put after
 * it.
 *
 * @param lines - The file, split into lines.
 * @param keyIndex - Where the key sits.
 * @param indent - The key's own indentation.
 * @returns The index just past the block's last line of content.
 */
export function endOfBlock(
  lines: readonly string[],
  keyIndex: number,
  indent: string,
): number {
  let past = keyIndex + 1;
  for (let index = keyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (BLANK_OR_COMMENT.test(line)) continue;
    if (!line.startsWith(`${indent} `) && !line.startsWith(`${indent}\t`)) break;
    past = index + 1;
  }
  return past;
}
