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

/**
 * Whether two open-state maps disagree.
 *
 * Compared key by key rather than by serialising both. The effect that reads
 * this runs on every keystroke in a service name field, because the list it
 * derives from is the services being edited, and building two strings to
 * decide that nothing has changed is work done in order to do nothing.
 *
 * `JSON.stringify` was also the wrong comparison. It preserves key order, so
 * two maps holding the same pairs in a different order came out unequal, and
 * the effect then wrote a value that changed nothing, which on reactive state
 * is itself a change.
 *
 * @param next - The map just derived from the configured services.
 * @param current - What the preview is showing.
 * @returns Whether the preview has to be told about it.
 */
export function openStateDiffers(
  next: Record<string, boolean>,
  current: Record<string, boolean>,
): boolean {
  const keys = Object.keys(next);
  if (keys.length !== Object.keys(current).length) return true;
  return keys.some((key) => next[key] !== current[key]);
}
