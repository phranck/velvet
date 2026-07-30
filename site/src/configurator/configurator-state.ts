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
  return JSON.stringify({
    ...settings,
    services:
      settings.services?.map((service) => ({
        serviceId: service.serviceId,
        checkId: service.checkId,
        checkName: service.checkName,
        name: service.name,
        url: service.url,
        icon: service.icon,
        method: service.method,
        expectedStatusCodes: service.expectedStatusCodes,
        maxRedirects: service.maxRedirects,
        timeoutMs: service.timeoutMs,
        headers: service.headers.map(({ name, secret }) => ({ name, secret })),
        jsonAssertions: service.jsonAssertions.map(
          ({ path, valueType, value }) => ({ path, valueType, value }),
        ),
        additionalChecks: service.additionalChecks,
      })) ?? null,
  });
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
