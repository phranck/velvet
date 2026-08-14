/**
 * What a visitor chose, kept on their own machine.
 *
 * A published page remembers two things: the window it is read over, and which
 * services stand open. Both are the visitor's choices rather than the
 * installation's, so they live in `localStorage` and never reach the
 * repository or the published data.
 *
 * Every design persists them, because that is a promise the product makes and
 * not a decision a design gets to take: `documentation/configuration.md` tells
 * an operator that a visitor's saved choice wins over the configured default,
 * and a design that forgot would make that sentence untrue on its pages alone.
 *
 * Storage can be absent or refuse to answer, in a private window or where a
 * browser is configured to reject it. Every function here degrades to the
 * fallback it was handed rather than failing, because a page that cannot
 * remember is still a page and a page that throws is not.
 */

import type { RangeKey } from "../data.js";


/** Where the chosen window is kept. */
const RANGE_KEY = "velvet:range";

/** Where one service's open state is kept, by service. */
function openKey(serviceId: string): string {
  return `velvet:open:${serviceId}`;
}

/** The windows a stored value may name, which is what the product offers. */
const RANGES: readonly RangeKey[] = ["month", "quarter", "all"];

/**
 * Storage, or nothing where the browser will not hand it over.
 *
 * Reading the property itself can throw, which is why this is a function with a
 * guard rather than a constant: in a private window the getter is what raises,
 * before any value has been asked for.
 */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * The window this visitor last chose.
 *
 * A value the product no longer offers is ignored rather than repaired. Ranges
 * have been renamed before, and a page that honoured a name it no longer draws
 * would open on nothing at all.
 *
 * @param fallback - The installation's configured default.
 * @returns The stored window, or the fallback.
 */
export function readRange(fallback: RangeKey): RangeKey {
  try {
    const stored = storage()?.getItem(RANGE_KEY);
    return RANGES.includes(stored as RangeKey) ? (stored as RangeKey) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Remembers the window this visitor chose.
 *
 * @param range - The window now being read.
 */
export function writeRange(range: RangeKey): void {
  try {
    storage()?.setItem(RANGE_KEY, range);
  } catch {
    // Storage is full or refused; the page goes on working without a memory.
  }
}

/**
 * Whether this visitor left a service open.
 *
 * @param serviceId - The service being restored.
 * @param fallback - What to assume where nothing was stored.
 * @returns Whether the service should open.
 */
export function readOpen(serviceId: string, fallback = false): boolean {
  try {
    const stored = storage()?.getItem(openKey(serviceId));
    if (stored === null || stored === undefined) return fallback;
    return stored === "1";
  } catch {
    return fallback;
  }
}

/**
 * Remembers whether a service stands open.
 *
 * @param serviceId - The service being recorded.
 * @param open - Whether it is now open.
 */
export function writeOpen(serviceId: string, open: boolean): void {
  try {
    storage()?.setItem(openKey(serviceId), open ? "1" : "0");
  } catch {
    // As above: a page that cannot remember is still a page.
  }
}
