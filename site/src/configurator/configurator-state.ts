import type { ConfiguratorSettings } from "./configuration";

export interface SaveShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export function exportedSettingsFingerprint(
  settings: ConfiguratorSettings,
): string {
  return JSON.stringify(settings);
}

export function isConfiguratorDirty(
  settings: ConfiguratorSettings,
  baseline: string,
): boolean {
  return exportedSettingsFingerprint(settings) !== baseline;
}

export function isSaveShortcut(event: SaveShortcutEvent): boolean {
  return (
    event.key.toLowerCase() === "s" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey
  );
}

export function isDistinctThemeName(
  candidate: string,
  selectedName: string,
): boolean {
  const normalized = candidate.trim().toLocaleLowerCase();
  return (
    normalized.length > 0 &&
    normalized !== selectedName.trim().toLocaleLowerCase()
  );
}
