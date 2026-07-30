export const CONFIGURATOR_SECTION_IDS = [
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

export function parseSectionState(
  serialized: string | null,
): ConfiguratorSectionState {
  const defaults = setAllSectionState(true);
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
