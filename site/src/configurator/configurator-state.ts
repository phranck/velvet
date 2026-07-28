import type { ConfiguratorSettings } from "./configuration";

export interface SaveShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
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

export function saveShortcutAction(
  event: SaveShortcutEvent,
): "save" | "save-as" | null {
  if (
    event.key.toLowerCase() !== "s" ||
    (!event.metaKey && !event.ctrlKey) ||
    event.altKey
  ) {
    return null;
  }

  return event.shiftKey ? "save-as" : "save";
}
