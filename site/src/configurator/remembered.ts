/**
 * What this browser remembers between visits, and how it is read back.
 *
 * All of it is preference rather than data: losing it costs a moment of
 * rearranging, so nothing here fails loudly. A browser set to refuse storage,
 * one whose quota is full, and a value written by an older version of this
 * page all end the same way, which is with the caller's own default.
 *
 * Each thing that remembers something owns its key and the shape it stores.
 * This owns the one part they share, so a browser that refuses storage is
 * handled once rather than once per preference.
 */

/** Where preferences are kept, or null in a browser that refuses them. */
function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Reading localStorage throws outright when the browser is set to refuse
    // it, so this is a refusal rather than an absence.
    return null;
  }
}

/**
 * Reads one remembered value back.
 *
 * @param key - Where it is kept.
 * @param interpret - Turns whatever was stored into the value, and decides for
 *   itself what to do with something it cannot use. It is handed `undefined`
 *   when nothing was stored or what was stored is not readable, so one
 *   function covers both.
 * @returns Whatever `interpret` made of it.
 */
export function remembered<T>(
  key: string,
  interpret: (stored: unknown) => T,
): T {
  const store = storage();
  if (!store) return interpret(undefined);
  try {
    const raw = store.getItem(key);
    return interpret(raw === null ? undefined : JSON.parse(raw));
  } catch {
    return interpret(undefined);
  }
}

/**
 * Writes one value back, and says nothing when it cannot.
 *
 * A browser refusing storage, or one whose quota is full, is not a reason to
 * interrupt somebody arranging a sidebar.
 *
 * @param key - Where to keep it.
 * @param value - What to keep, as anything JSON can carry.
 */
export function remember(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do and nothing worth saying.
  }
}
