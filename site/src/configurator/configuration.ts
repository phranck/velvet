import { dump, load } from "js-yaml";
import { configurationIdentifierFromName } from "@velvet/contracts";

import type { VelvetLayout } from "../lib/config";
import { canonicalConfiguratorTheme } from "../lib/configuration-theme.js";
import {
  normalizeThemeConfiguration,
  resolveTheme,
} from "../lib/theme.js";

export type ConfiguratorTheme = ReturnType<typeof normalizeThemeConfiguration>;
export type ConfiguratorDocument = Record<string, unknown>;

export interface ConfiguratorSettings {
  layout: VelvetLayout;
  theme: ConfiguratorTheme;
  icons: Record<string, string>;
}

export interface ParsedConfiguratorYaml {
  document: ConfiguratorDocument;
  settings: ConfiguratorSettings;
}

export interface ConfiguratorServiceOption {
  id: string;
  name: string;
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
    throw new Error(`Invalid YAML: ${(error as Error).message}`, { cause: error });
  }

  if (!isRecord(loaded)) {
    throw new Error("The YAML root must be a mapping.");
  }

  const statusWebsite = optionalMapping(
    loaded["status-website"],
    "status-website",
  );
  const velvet = optionalMapping(statusWebsite?.velvet, "status-website.velvet");
  const nativeStatusPage = optionalMapping(loaded.statusPage, "statusPage");
  const nativeThemeDocument = optionalMapping(
    nativeStatusPage?.theme,
    "statusPage.theme",
  );
  const themeDocument = optionalMapping(
    nativeThemeDocument ?? velvet?.theme,
    "status-website.velvet.theme",
  );
  const themeInput = nativeThemeDocument
    ? configuratorThemeFromCanonical(nativeThemeDocument)
    : ({
        ...themeDocument,
        accent: themeDocument?.accent ?? velvet?.accent,
        accentDeg: velvet?.accentDeg,
        accentDown: velvet?.accentDown,
      } as NonNullable<Parameters<typeof resolveTheme>[0]>);
  const theme = normalizeThemeConfiguration(themeInput);
  validateHexTheme(resolveTheme(theme));
  const icons = iconMapping(
    nativeStatusPage?.icons ?? velvet?.icons,
    nativeStatusPage ? "statusPage.icons" : "status-website.velvet.icons",
  );

  return {
    document: structuredClone(loaded),
    settings: {
      layout:
        nativeStatusPage?.layout === "cards" || velvet?.layout === "cards"
          ? "cards"
          : "grouped",
      theme,
      icons,
    },
  };
}

export function updateConfiguratorDocument(
  document: ConfiguratorDocument,
  settings: ConfiguratorSettings,
): ConfiguratorDocument {
  const updated = cloneConfigurationDocument(document);
  if (isNativeConfiguration(updated)) {
    const statusPage = isRecord(updated.statusPage)
      ? { ...updated.statusPage }
      : {};
    delete statusPage.icons;
    statusPage.layout = settings.layout;
    statusPage.theme = canonicalConfiguratorTheme(settings.theme);
    if (Object.keys(settings.icons).length > 0) {
      statusPage.icons = { ...settings.icons };
    }
    updated.statusPage = statusPage;
    return updated;
  }
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
  delete existingVelvet.icons;

  statusWebsite.velvet = {
    ...existingVelvet,
    layout: settings.layout,
    theme: cloneConfiguratorTheme(settings.theme),
    ...(Object.keys(settings.icons).length > 0
      ? { icons: { ...settings.icons } }
      : {}),
  };
  updated["status-website"] = statusWebsite;
  return updated;
}

export function exportVelvetYaml(
  document: ConfiguratorDocument,
  settings: ConfiguratorSettings,
): string {
  const updated = updateConfiguratorDocument(document, settings);
  if (isNativeConfiguration(updated)) {
    return dump({ statusPage: updated.statusPage }, YAML_OPTIONS);
  }
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

export function configuratorServiceOptions(
  document: ConfiguratorDocument | null,
): ConfiguratorServiceOption[] {
  if (!document) return [];
  const candidates = Array.isArray(document.services)
    ? document.services
    : Array.isArray(document.sites)
      ? document.sites
      : [];
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.name !== "string") return [];
    const name = candidate.name.trim();
    const explicitId = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const id = explicitId || configurationIdentifierFromName(name);
    if (!name || !id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name }];
  });
}

function cloneConfigurationDocument(
  document: ConfiguratorDocument,
): ConfiguratorDocument {
  return cloneConfigurationValue(document, new WeakMap()) as ConfiguratorDocument;
}

function cloneConfigurationValue(
  value: unknown,
  copies: WeakMap<object, unknown>,
): unknown {
  if (typeof value !== "object" || value === null) return value;

  const existing = copies.get(value);
  if (existing !== undefined) return existing;

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    copies.set(value, copy);
    for (const item of value) {
      copy.push(cloneConfigurationValue(item, copies));
    }
    return copy;
  }

  if (isRecord(value)) {
    const copy: ConfiguratorDocument = {};
    copies.set(value, copy);
    for (const key of Object.keys(value)) {
      copy[key] = cloneConfigurationValue(value[key], copies);
    }
    return copy;
  }

  return structuredClone(value);
}

function optionalMapping(
  value: unknown,
  path: string,
): ConfiguratorDocument | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error(`${path} must be a mapping.`);
  return value;
}

function iconMapping(value: unknown, path: string): Record<string, string> {
  const mapping = optionalMapping(value, path);
  if (!mapping) return {};
  const icons: Record<string, string> = {};
  for (const [serviceId, icon] of Object.entries(mapping)) {
    if (typeof icon !== "string") throw new Error(`${path}.${serviceId} must be a string.`);
    icons[serviceId] = icon;
  }
  return icons;
}

function isNativeConfiguration(document: ConfiguratorDocument): boolean {
  return document.schemaVersion === 1 || isRecord(document.statusPage);
}

function configuratorThemeFromCanonical(
  source: ConfiguratorDocument,
): NonNullable<Parameters<typeof resolveTheme>[0]> {
  const chart = optionalMapping(source.chart, "statusPage.theme.chart");
  const { line, lineStyle, ...remainingChart } = chart ?? {};
  return {
    ...source,
    protocol: {
      ...(isRecord(source.protocol) ? source.protocol : {}),
      ...(line === undefined ? {} : { ipv4: line }),
    },
    chart: {
      ...remainingChart,
      ...(lineStyle === undefined ? {} : { ipv4LineStyle: lineStyle }),
    },
  } as NonNullable<Parameters<typeof resolveTheme>[0]>;
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
