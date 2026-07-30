import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { EMBEDDED_THEME_REGISTRY } from "../configurator/theme-registry.js";
import { canonicalSystemTheme } from "../lib/configuration-theme.js";

export interface ThemeScreenshotManifestEntry {
  file: string;
  imageSha256: string;
  themeSha256: string;
}

export interface ThemeScreenshotManifest {
  schemaVersion: 1;
  viewport: { width: number; height: number };
  themes: Record<string, ThemeScreenshotManifestEntry>;
}

export function themeConfigurationSha256(themeId: string): string {
  const theme = EMBEDDED_THEME_REGISTRY.themes.find(({ id }) => id === themeId);
  if (!theme) throw new Error(`Unknown system theme: ${themeId}`);
  return sha256(JSON.stringify(canonicalSystemTheme(theme)));
}

export async function validateThemeScreenshotManifest(
  value: unknown,
  { assetDirectory }: { assetDirectory: string },
): Promise<{ valid: true } | { valid: false; reason: string }> {
  if (!isManifest(value)) {
    return { valid: false, reason: "Invalid screenshot manifest." };
  }

  const expectedIds = EMBEDDED_THEME_REGISTRY.themes.map(({ id }) => id);
  if (
    Object.keys(value.themes).sort().join("\n") !==
    [...expectedIds].sort().join("\n")
  ) {
    return { valid: false, reason: "Screenshot themes do not match the system themes." };
  }

  for (const themeId of expectedIds) {
    const entry = value.themes[themeId];
    if (entry.themeSha256 !== themeConfigurationSha256(themeId)) {
      return { valid: false, reason: `Theme data changed for ${themeId}.` };
    }
    const image = await readFile(resolve(assetDirectory, entry.file));
    if (sha256(image) !== entry.imageSha256) {
      return { valid: false, reason: `Screenshot changed for ${themeId}.` };
    }
  }

  return { valid: true };
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isManifest(value: unknown): value is ThemeScreenshotManifest {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (!isRecord(value.viewport) || !isRecord(value.themes)) return false;
  if (
    !Number.isInteger(value.viewport.width) ||
    !Number.isInteger(value.viewport.height)
  ) {
    return false;
  }
  return Object.values(value.themes).every(
    (entry) =>
      isRecord(entry) &&
      typeof entry.file === "string" &&
      /^[a-z0-9-]+\.png$/.test(entry.file) &&
      /^[a-f0-9]{64}$/.test(String(entry.imageSha256)) &&
      /^[a-f0-9]{64}$/.test(String(entry.themeSha256)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
