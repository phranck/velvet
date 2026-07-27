import { dump, load } from "js-yaml";

import type { VelvetLayout } from "../lib/config";
import {
  normalizeThemeConfiguration,
  resolveTheme,
} from "../lib/theme.js";

export type ConfiguratorTheme = ReturnType<typeof normalizeThemeConfiguration>;
export type ConfiguratorDocument = Record<string, unknown>;

export interface ConfiguratorSettings {
  layout: VelvetLayout;
  theme: ConfiguratorTheme;
}

export interface ParsedConfiguratorYaml {
  document: ConfiguratorDocument;
  settings: ConfiguratorSettings;
}

export function cloneConfiguratorTheme(
  theme: ConfiguratorTheme,
): ConfiguratorTheme {
  return normalizeThemeConfiguration(JSON.parse(JSON.stringify(theme)));
}

const YAML_OPTIONS = {
  forceQuotes: false,
  lineWidth: 100,
  noRefs: true,
  quotingType: '"',
} as const;

export function parseConfiguratorYaml(source: string): ParsedConfiguratorYaml {
  let loaded: unknown;
  try {
    loaded = source.trim() ? load(source) : {};
  } catch (error) {
    throw new Error(`Invalid YAML: ${(error as Error).message}`);
  }

  if (!isRecord(loaded)) {
    throw new Error("The YAML root must be a mapping.");
  }

  const statusWebsite = optionalMapping(
    loaded["status-website"],
    "status-website",
  );
  const velvet = optionalMapping(statusWebsite?.velvet, "status-website.velvet");
  const themeDocument = optionalMapping(
    velvet?.theme,
    "status-website.velvet.theme",
  );
  const themeInput = {
    ...themeDocument,
    accent: themeDocument?.accent ?? velvet?.accent,
    accentDeg: velvet?.accentDeg,
    accentDown: velvet?.accentDown,
  } as NonNullable<Parameters<typeof resolveTheme>[0]>;
  const theme = normalizeThemeConfiguration(themeInput);
  validateHexTheme(resolveTheme(theme));

  return {
    document: structuredClone(loaded),
    settings: {
      layout: velvet?.layout === "cards" ? "cards" : "grouped",
      theme,
    },
  };
}

export function updateConfiguratorDocument(
  document: ConfiguratorDocument,
  settings: ConfiguratorSettings,
): ConfiguratorDocument {
  const updated = structuredClone(document);
  const statusWebsite = isRecord(updated["status-website"])
    ? { ...updated["status-website"] }
    : {};
  const existingVelvet = isRecord(statusWebsite.velvet)
    ? { ...statusWebsite.velvet }
    : {};

  delete existingVelvet.accent;
  delete existingVelvet.accentDeg;
  delete existingVelvet.accentDown;
  delete existingVelvet.showSubscribe;

  statusWebsite.velvet = {
    ...existingVelvet,
    layout: settings.layout,
    theme: cloneConfiguratorTheme(settings.theme),
  };
  updated["status-website"] = statusWebsite;
  return updated;
}

export function exportVelvetYaml(
  document: ConfiguratorDocument,
  settings: ConfiguratorSettings,
): string {
  const updated = updateConfiguratorDocument(document, settings);
  const statusWebsite = updated["status-website"] as ConfiguratorDocument;
  return dump(
    {
      "status-website": {
        velvet: statusWebsite.velvet,
      },
    },
    YAML_OPTIONS,
  );
}

export function exportConfigurationYaml(
  document: ConfiguratorDocument | null,
  settings: ConfiguratorSettings,
): string {
  const base =
    document ??
    ({
      owner: "your-github-owner",
      repo: "your-status-repo",
      "status-website": { name: "Status" },
    } satisfies ConfiguratorDocument);
  return dump(updateConfiguratorDocument(base, settings), YAML_OPTIONS);
}

function optionalMapping(
  value: unknown,
  path: string,
): ConfiguratorDocument | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${path} must be a mapping.`);
  return value;
}

function isRecord(value: unknown): value is ConfiguratorDocument {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateHexTheme(theme: ReturnType<typeof resolveTheme>): void {
  const colors: Array<[string, string]> = [
    ["theme.accent", theme.accent],
    ["theme.palette.canvas", theme.palette.canvas],
    ["theme.palette.foreground", theme.palette.foreground],
    ["theme.palette.accent", theme.palette.accent],
    ["theme.palette.alternate", theme.palette.alternate],
    ["theme.palette.warning", theme.palette.warning],
    ["theme.palette.danger", theme.palette.danger],
    ["theme.palette.textPrimary", theme.palette.textPrimary],
    ["theme.palette.textSecondary", theme.palette.textSecondary],
    ["theme.palette.textTertiary", theme.palette.textTertiary],
    ["theme.grid.operational", theme.grid.operational],
    ["theme.grid.degraded", theme.grid.degraded],
    ["theme.grid.outage", theme.grid.outage],
    ["theme.grid.noData", theme.grid.noData],
    ["theme.protocol.ipv4", theme.protocol.ipv4],
    ["theme.protocol.ipv6", theme.protocol.ipv6],
    ["theme.chart.background", theme.chart.background],
    ["theme.background.start", theme.background.start],
    ["theme.background.end", theme.background.end],
    ["theme.background.blobs.colors[0]", theme.background.blobs.colors[0]],
    ["theme.background.blobs.colors[1]", theme.background.blobs.colors[1]],
    ["theme.card.background", theme.card.background],
    ["theme.card.border", theme.card.border],
    ["theme.card.separator", theme.card.separator],
    ["theme.headline.start", theme.headline.start],
    ["theme.headline.end", theme.headline.end],
    ["theme.service.icon", theme.service.icon],
    ["theme.text.primary", theme.text.primary],
    ["theme.text.secondary", theme.text.secondary],
    ["theme.text.tertiary", theme.text.tertiary],
  ];

  for (const [path, value] of colors) {
    if (!/^#[\da-f]{6}$/i.test(value)) {
      throw new Error(`${path} must be a six-digit hexadecimal color.`);
    }
  }
}
