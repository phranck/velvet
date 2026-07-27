import {
  exportConfigurationYaml,
  parseConfiguratorYaml,
  type ConfiguratorDocument,
  type ConfiguratorSettings,
} from "./configuration.js";

export const CONFIGURATOR_SESSION_STORAGE_KEY =
  "velvet.configurator.session.v1";

export interface ConfiguratorSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ConfiguratorSession {
  settings: ConfiguratorSettings;
  importedDocument: ConfiguratorDocument | null;
  importedFilename: string;
  selectedThemeId: string | null;
  loadedThemeName: string;
  selectedBaseline: string;
}

interface StoredConfiguratorSession {
  version: 1;
  source: string;
  imported: boolean;
  filename: string;
  selectedThemeId: string | null;
  loadedThemeName: string;
  selectedBaseline: string;
}

export function persistConfiguratorSession(
  session: ConfiguratorSession,
  storage: ConfiguratorSessionStorage | null | undefined,
): boolean {
  if (!storage) return false;

  const stored: StoredConfiguratorSession = {
    version: 1,
    source: exportConfigurationYaml(
      session.importedDocument,
      session.settings,
    ),
    imported: session.importedDocument !== null,
    filename: session.importedFilename,
    selectedThemeId: session.selectedThemeId,
    loadedThemeName: session.loadedThemeName,
    selectedBaseline: session.selectedBaseline,
  };

  try {
    storage.setItem(CONFIGURATOR_SESSION_STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function loadConfiguratorSession(
  storage: ConfiguratorSessionStorage | null | undefined,
): ConfiguratorSession | null {
  if (!storage) return null;

  const source = storage.getItem(CONFIGURATOR_SESSION_STORAGE_KEY);
  if (!source) return null;

  try {
    const stored = parseStoredSession(JSON.parse(source));
    const parsed = parseConfiguratorYaml(stored.source);
    return {
      settings: parsed.settings,
      importedDocument: stored.imported ? parsed.document : null,
      importedFilename: stored.filename,
      selectedThemeId: stored.selectedThemeId,
      loadedThemeName: stored.loadedThemeName,
      selectedBaseline: stored.selectedBaseline,
    };
  } catch {
    try {
      storage.removeItem(CONFIGURATOR_SESSION_STORAGE_KEY);
    } catch {
      // Unavailable storage falls back to a fresh in-memory session.
    }
    return null;
  }
}

function parseStoredSession(value: unknown): StoredConfiguratorSession {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("Unsupported configurator session.");
  }
  if (
    typeof value.source !== "string" ||
    typeof value.imported !== "boolean" ||
    typeof value.filename !== "string" ||
    value.filename.trim().length === 0 ||
    (value.selectedThemeId !== null &&
      typeof value.selectedThemeId !== "string") ||
    typeof value.loadedThemeName !== "string" ||
    typeof value.selectedBaseline !== "string"
  ) {
    throw new Error("Invalid configurator session.");
  }

  return value as unknown as StoredConfiguratorSession;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
