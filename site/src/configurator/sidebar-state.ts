/**
 * What the sidebar remembers between visits.
 *
 * Its width, whether it is collapsed, which sections are open, and the order
 * somebody put them in. All of it is a preference rather than data: losing it
 * costs a moment of rearranging, so nothing here fails loudly and everything
 * falls back to the default when what was stored no longer makes sense.
 */

/** Where the preferences live, beside whatever else this browser holds. */
const STORAGE_KEY = "velvet:configurator:sidebar";

/**
 * How wide the sidebar may be.
 *
 * Below 320 a colour picker does not fit, nor a row with its label beside it.
 * Above 640 too little is left of the monitor on a 1280 pixel window to judge
 * a status page by. Collapsed is a state of its own rather than a width of
 * zero, because two ways of saying the same thing is one too many.
 */
export const MIN_SIDEBAR_WIDTH = 320;
export const MAX_SIDEBAR_WIDTH = 640;
export const DEFAULT_SIDEBAR_WIDTH = 380;

/**
 * The section that does not move.
 *
 * Update notices stand at the top whenever there are any, and are absent when
 * there are none. They are not part of the order somebody arranges, because
 * what they announce is the one thing that should not be arranged out of the
 * way.
 */
export const PINNED_SECTION = "updates" as const;

/**
 * The sections somebody can arrange, in the order they appear until they do.
 *
 * The keys are what gets stored. A section added here appears at this position
 * for everybody, including people who have already arranged theirs, and one
 * removed disappears from a stored order without disturbing the rest.
 */
export const SECTION_KEYS = [
  "installation",
  "theme",
  "global",
  "services",
  "theme-settings",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** Every section the sidebar shows, arrangeable or not. */
export type AnySectionKey = SectionKey | typeof PINNED_SECTION;

/** What the sidebar looks like right now. */
export interface SidebarPreferences {
  /** Its width in pixels, always within the bounds above. */
  width: number;
  /** Whether it is out of the way entirely. */
  collapsed: boolean;
  /** The sections that are open, as a set of keys, pinned one included. */
  open: AnySectionKey[];
  /** Every section, in the order they are shown. */
  order: SectionKey[];
}

/** What somebody sees before they have arranged anything. */
export function defaultPreferences(): SidebarPreferences {
  return {
    width: DEFAULT_SIDEBAR_WIDTH,
    collapsed: false,
    // Everything open to begin with: a sidebar of closed headings says
    // nothing about what is in it.
    open: [PINNED_SECTION, ...SECTION_KEYS],
    order: [...SECTION_KEYS],
  };
}

/** Holds a width inside its bounds, whatever it arrived as. */
export function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)));
}

/**
 * Reads a stored order back, dropping what is gone and adding what is new.
 *
 * The stored value holds keys and no positions, which is what makes this
 * possible without a migration step. A section that has since been removed is
 * dropped, and one that has since been added is put where it stands in the
 * default order rather than at the end, so it appears where its neighbours
 * would lead somebody to look for it.
 *
 * @param stored - Whatever was in storage, of unknown shape.
 * @returns Every current section exactly once.
 */
export function reconcileOrder(stored: unknown): SectionKey[] {
  const known = new Set<string>(SECTION_KEYS);
  const kept = Array.isArray(stored)
    ? stored.filter(
        (key): key is SectionKey => typeof key === "string" && known.has(key),
      )
    : [];
  const seen = new Set(kept);
  const order = [...kept];
  for (const [index, key] of SECTION_KEYS.entries()) {
    if (seen.has(key)) continue;
    // Its place in the default order, counted among the sections already
    // present, so it lands between the same neighbours it has by default.
    const before = SECTION_KEYS.slice(0, index).filter((earlier) =>
      seen.has(earlier),
    ).length;
    order.splice(before, 0, key);
    seen.add(key);
  }
  return order;
}

/** Reads the open set back, keeping only sections that still exist. */
function reconcileOpen(stored: unknown): AnySectionKey[] {
  const known = new Set<string>([PINNED_SECTION, ...SECTION_KEYS]);
  if (!Array.isArray(stored)) return [PINNED_SECTION, ...SECTION_KEYS];
  return stored.filter(
    (key): key is AnySectionKey => typeof key === "string" && known.has(key),
  );
}

/** Where preferences are kept, or null in a browser that refuses storage. */
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
 * Reads the preferences, falling back to the defaults for anything unusable.
 *
 * @returns A complete set, whatever was or was not stored.
 */
export function loadPreferences(): SidebarPreferences {
  const store = storage();
  if (!store) return defaultPreferences();
  let parsed: unknown;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (raw === null) return defaultPreferences();
    parsed = JSON.parse(raw);
  } catch {
    return defaultPreferences();
  }
  if (typeof parsed !== "object" || parsed === null) return defaultPreferences();
  const record = parsed as Record<string, unknown>;
  return {
    width: clampWidth(
      typeof record.width === "number" ? record.width : DEFAULT_SIDEBAR_WIDTH,
    ),
    collapsed: record.collapsed === true,
    open: reconcileOpen(record.open),
    order: reconcileOrder(record.order),
  };
}

/**
 * Writes the preferences back, and says nothing when it cannot.
 *
 * A browser refusing storage, or one whose quota is full, is not a reason to
 * interrupt somebody arranging a sidebar.
 */
export function savePreferences(preferences: SidebarPreferences): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Nothing to do and nothing worth saying.
  }
}

/**
 * Moves one section by a number of places, staying inside the list.
 *
 * @param order - The current order.
 * @param key - The section being moved.
 * @param by - How far, negative towards the top.
 * @returns The new order, or the old one when the move goes nowhere.
 */
export function moveSection(
  order: readonly SectionKey[],
  key: SectionKey,
  by: number,
): SectionKey[] {
  const from = order.indexOf(key);
  if (from === -1) return [...order];
  const to = Math.min(order.length - 1, Math.max(0, from + by));
  if (to === from) return [...order];
  const moved = [...order];
  moved.splice(from, 1);
  moved.splice(to, 0, key);
  return moved;
}

/**
 * Puts one section where another one currently stands.
 *
 * What a drag means: the section being carried lands at the position of the
 * one it was dropped on, and everything between them shifts by one. Expressed
 * as two keys rather than as two indices, because the caller holds keys and
 * converting twice is a place for the two to disagree.
 *
 * @param order - The current order.
 * @param key - The section being moved.
 * @param onto - The section it was dropped on.
 * @returns The new order, or the old one when the move goes nowhere.
 */
export function placeSection(
  order: readonly SectionKey[],
  key: SectionKey,
  onto: SectionKey,
): SectionKey[] {
  const from = order.indexOf(key);
  const to = order.indexOf(onto);
  if (from === -1 || to === -1 || from === to) return [...order];
  const moved = [...order];
  moved.splice(from, 1);
  moved.splice(to, 0, key);
  return moved;
}
