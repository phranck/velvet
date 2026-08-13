/**
 * Whether a value is a plain object, as JSON produces one.
 *
 * `typeof null` is `"object"` and so is an array, so both are ruled out. An
 * array is ruled out because everything reaching for this is about to read a
 * named field, and a JSON array answers such a read with `undefined` rather
 * than refusing it, which turns a wrong shape into a silently empty one.
 *
 * Held here because five modules had a copy, and one of them had lost the array
 * check: `references/installation.ts` accepted a `config.json` that was an
 * array, cast it, read no `dataBaseUrl` from it, and drew a card that said it
 * had no data rather than leaving the installation out. Four copies agreeing
 * and one not is the shape that is hard to notice, because a reader who checks
 * one file has no reason to check the others.
 *
 * @param value - Anything, typically just parsed from JSON or read from storage.
 * @returns Whether the value can have its fields read.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
