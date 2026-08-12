export const CONFIGURATOR_SECTION_IDS = [
  "updates",
  "themes",
  "icons",
  "palette",
  "layout",
  "chart",
  "background",
  "cards",
  "advanced",
] as const;

export type ConfiguratorSectionId =
  (typeof CONFIGURATOR_SECTION_IDS)[number];
export type ConfiguratorSectionState = Record<ConfiguratorSectionId, boolean>;

export function setAllSectionState(open: boolean): ConfiguratorSectionState {
  return Object.fromEntries(
    CONFIGURATOR_SECTION_IDS.map((id) => [id, open]),
  ) as ConfiguratorSectionState;
}

/**
 * Restores the saved section state, or the first-visit default.
 *
 * A first visit starts with every section collapsed, so the sidebar opens as a
 * short, scannable list of what can be configured rather than as one long
 * scroll the reader has to close before finding anything.
 */
export function parseSectionState(
  serialized: string | null,
): ConfiguratorSectionState {
  const defaults = setAllSectionState(false);
  if (!serialized) return defaults;

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return defaults;
    }

    for (const id of CONFIGURATOR_SECTION_IDS) {
      const value = (parsed as Record<string, unknown>)[id];
      if (value !== undefined && typeof value !== "boolean") return defaults;
      if (typeof value === "boolean") defaults[id] = value;
    }
    return defaults;
  } catch {
    return defaults;
  }
}

export function serializeSectionState(
  state: Record<string, boolean>,
): string {
  return JSON.stringify(
    Object.fromEntries(
      CONFIGURATOR_SECTION_IDS.map((id) => [id, state[id] ?? true]),
    ),
  );
}

export function parseSidebarCollapsed(serialized: string | null): boolean {
  return serialized === "true";
}

export function serializeSidebarCollapsed(collapsed: boolean): string {
  return String(collapsed);
}

/**
 * Where the sidebar's own state is kept between visits.
 *
 * Held beside the code that serialises what is stored, because the key and the
 * shape are one decision: changing either without the other loses whatever was
 * saved, and a key stated in the component left the two a file apart.
 */
const SECTION_STORAGE_KEY = "velvet.configurator.sections.v1";
const SIDEBAR_STORAGE_KEY = "velvet.configurator.sidebar.v1";

/**
 * The storage this runs against, or null where there is none.
 *
 * Reaching for `localStorage` throws rather than returning null in a browser
 * that has it disabled, and the whole tool works without it, so every path
 * below treats its absence as an empty store.
 */
function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The section state this browser last had, or the first-visit default. */
export function readSectionState(): ConfiguratorSectionState {
  try {
    return parseSectionState(storage()?.getItem(SECTION_STORAGE_KEY) ?? null);
  } catch {
    return parseSectionState(null);
  }
}

/** Remembers which sections are open. Silent where there is no storage. */
export function writeSectionState(state: ConfiguratorSectionState): void {
  try {
    storage()?.setItem(SECTION_STORAGE_KEY, serializeSectionState(state));
  } catch {
    // The configurator still works when local storage is unavailable.
  }
}

/** Whether the sidebar was collapsed when this browser last left. */
export function readSidebarCollapsed(): boolean {
  try {
    return parseSidebarCollapsed(storage()?.getItem(SIDEBAR_STORAGE_KEY) ?? null);
  } catch {
    return false;
  }
}

/** Remembers whether the sidebar is collapsed. Silent where there is no storage. */
export function writeSidebarCollapsed(collapsed: boolean): void {
  try {
    storage()?.setItem(SIDEBAR_STORAGE_KEY, serializeSidebarCollapsed(collapsed));
  } catch {
    // The configurator still works when local storage is unavailable.
  }
}
