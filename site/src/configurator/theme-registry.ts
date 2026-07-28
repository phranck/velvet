import {
  CARD_WIDTH_STEPS,
  normalizeThemeConfiguration,
  PALETTE_KEYS,
  resolveTheme,
} from "../lib/theme.js";
import type { FetchImplementation } from "../lib/fetch.js";
import type { ConfiguratorTheme } from "./configuration";

export interface RegistryTheme {
  id: string;
  name: string;
  author?: string;
  theme: ConfiguratorTheme;
}

export interface ThemeRegistry {
  schemaVersion: 1;
  themes: RegistryTheme[];
}

export interface ThemeRegistryLoadResult {
  registry: ThemeRegistry;
  source: "remote" | "cache" | "embedded";
}

interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
}

const REGISTRY_URL = "https://phranck.github.io/velvet-themes/index.json";
const CACHE_KEY = "velvet.configurator.theme-registry.v1";
const HEX = /^#[\da-f]{6}$/i;
const THEME_KEYS = new Set([
  "name",
  "palette",
  "grid",
  "protocol",
  "chart",
  "background",
  "card",
  "headline",
  "service",
  "text",
]);

export const EMBEDDED_THEME_REGISTRY: ThemeRegistry = parseThemeRegistry({
  schemaVersion: 1,
  themes: [
    {
      id: "velvet-default",
      name: "Velvet Default",
      author: "Velvet",
      theme: {
        palette: {
          canvas: "#0a0b0f",
          foreground: "#e8eaed",
          accent: "#6366f1",
          alternate: "#38bdf8",
          warning: "#d29922",
          danger: "#f85149",
          textPrimary: "#e8eaed",
          textSecondary: "#8b8c90",
          textTertiary: "#515256",
        },
      },
    },
    {
      id: "cloudy-autumn",
      name: "Cloudy Autumn",
      author: "Velvet",
      theme: {
        palette: {
          canvas: "#17100d",
          foreground: "#fff2dc",
          accent: "#d97732",
          alternate: "#e9b949",
          warning: "#f0a229",
          danger: "#d84a3a",
          textPrimary: "#fff2dc",
          textSecondary: "#9e9385",
          textTertiary: "#61584f",
        },
      },
    },
    {
      id: "sunny-spring",
      name: "Sunny Spring",
      author: "Velvet",
      theme: {
        palette: {
          canvas: "#101713",
          foreground: "#f2f8e9",
          accent: "#78c850",
          alternate: "#f2cf4a",
          warning: "#e9a53b",
          danger: "#ef6868",
          textPrimary: "#f2f8e9",
          textSecondary: "#939a8f",
          textTertiary: "#585f57",
        },
      },
    },
    {
      id: "violet-velvet",
      name: "Violet Velvet",
      author: "Velvet",
      theme: {
        palette: {
          canvas: "#0d0915",
          foreground: "#f3edff",
          accent: "#8b5cf6",
          alternate: "#d946ef",
          warning: "#e6a23c",
          danger: "#f0526f",
          textPrimary: "#f3edff",
          textSecondary: "#928d9d",
          textTertiary: "#575260",
        },
      },
    },
  ],
});

export function parseThemeRegistry(value: unknown): ThemeRegistry {
  const registry = mapping(value, "registry");
  assertOnlyKeys(registry, ["schemaVersion", "themes"], "registry");
  if (registry.schemaVersion !== 1) {
    throw new Error("Theme registry schemaVersion must be 1.");
  }
  if (!Array.isArray(registry.themes) || registry.themes.length === 0) {
    throw new Error("Theme registry themes must be a non-empty array.");
  }

  const ids = new Set<string>();
  const themes = registry.themes.map((entry, index) => {
    const path = `themes[${index}]`;
    const record = mapping(entry, path);
    assertOnlyKeys(record, ["id", "name", "author", "theme"], path);
    const id = shortText(record.id, `${path}.id`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new Error(`${path}.id must use lowercase kebab-case.`);
    }
    if (ids.has(id)) throw new Error(`${path}.id must be unique.`);
    ids.add(id);

    const name = shortText(record.name, `${path}.name`);
    const author =
      record.author === undefined
        ? undefined
        : shortText(record.author, `${path}.author`);
    const themeInput = mapping(record.theme, `${path}.theme`);
    assertOnlyKeys(themeInput, [...THEME_KEYS], `${path}.theme`);
    validatePalette(themeInput.palette, `${path}.theme.palette`);
    validateThemeColorSources(themeInput, `${path}.theme`);
    const theme = normalizeThemeConfiguration({ ...themeInput, name });
    validateResolvedTheme(theme, `${path}.theme`);

    return { id, name, ...(author ? { author } : {}), theme };
  });

  return { schemaVersion: 1, themes };
}

export async function loadThemeRegistry({
  fetchImplementation = globalThis.fetch,
  storage = globalThis.localStorage,
  url = REGISTRY_URL,
}: {
  fetchImplementation?: FetchImplementation;
  storage?: ThemeStorage;
  url?: string;
} = {}): Promise<ThemeRegistryLoadResult> {
  try {
    const response = await fetchImplementation(url, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Theme registry ${response.status}`);
    const registry = parseThemeRegistry(await response.json());
    try {
      storage.setItem(CACHE_KEY, JSON.stringify(registry));
    } catch {
      // Registry use does not depend on browser storage.
    }
    return { registry, source: "remote" };
  } catch {
    try {
      const cached = storage.getItem(CACHE_KEY);
      if (cached) {
        return { registry: parseThemeRegistry(JSON.parse(cached)), source: "cache" };
      }
    } catch {
      // Invalid or unavailable cache falls through to the embedded themes.
    }
    return { registry: EMBEDDED_THEME_REGISTRY, source: "embedded" };
  }
}

function validatePalette(value: unknown, path: string): void {
  const palette = mapping(value, path);
  assertOnlyKeys(palette, [...PALETTE_KEYS], path);
  for (const key of PALETTE_KEYS) {
    if (!HEX.test(String(palette[key] ?? ""))) {
      throw new Error(`${path}.${key} must be a six-digit hexadecimal color.`);
    }
  }
}

function validateThemeColorSources(theme: Record<string, unknown>, path: string): void {
  const groups: Array<[string, readonly string[]]> = [
    ["grid", ["operational", "degraded", "outage", "noData"]],
    ["protocol", ["ipv4", "ipv6"]],
    ["headline", ["start", "end"]],
    ["service", ["icon"]],
    ["text", ["primary", "secondary", "tertiary"]],
  ];
  for (const [key, allowed] of groups) {
    if (theme[key] === undefined) continue;
    const group = mapping(theme[key], `${path}.${key}`);
    assertOnlyKeys(group, [...allowed], `${path}.${key}`);
    for (const role of allowed) validateColorSource(group[role], `${path}.${key}.${role}`);
  }

  if (theme.chart !== undefined) {
    const chart = mapping(theme.chart, `${path}.chart`);
    assertOnlyKeys(
      chart,
      [
        "ipv4LineStyle",
        "ipv6LineStyle",
        "fill",
        "background",
        "backgroundOpacity",
      ],
      `${path}.chart`,
    );
    validateColorSource(chart.background, `${path}.chart.background`);
    if (
      chart.backgroundOpacity !== undefined &&
      (typeof chart.backgroundOpacity !== "number" ||
        !Number.isFinite(chart.backgroundOpacity) ||
        chart.backgroundOpacity < 0 ||
        chart.backgroundOpacity > 1)
    ) {
      throw new Error(`${path}.chart.backgroundOpacity must be between 0 and 1.`);
    }
  }
  if (theme.background !== undefined) {
    const background = mapping(theme.background, `${path}.background`);
    assertOnlyKeys(background, ["start", "end", "blobs"], `${path}.background`);
    validateColorSource(background.start, `${path}.background.start`);
    validateColorSource(background.end, `${path}.background.end`);
    if (background.blobs !== undefined) {
      const blobs = mapping(background.blobs, `${path}.background.blobs`);
      assertOnlyKeys(blobs, ["enabled", "count", "colors"], `${path}.background.blobs`);
      if (blobs.colors !== undefined) {
        if (!Array.isArray(blobs.colors) || blobs.colors.length !== 2) {
          throw new Error(`${path}.background.blobs.colors must contain two colors.`);
        }
        blobs.colors.forEach((color, index) =>
          validateColorSource(color, `${path}.background.blobs.colors[${index}]`),
        );
      }
    }
  }
  if (theme.card !== undefined) {
    const card = mapping(theme.card, `${path}.card`);
    assertOnlyKeys(
      card,
      [
        "background",
        "border",
        "separator",
        "borderEnabled",
        "shadowEnabled",
        "radius",
        "padding",
        "maxWidth",
      ],
      `${path}.card`,
    );
    for (const key of ["background", "border", "separator"]) {
      validateColorSource(card[key], `${path}.card.${key}`);
    }
    if (
      card.shadowEnabled !== undefined &&
      typeof card.shadowEnabled !== "boolean"
    ) {
      throw new Error(`${path}.card.shadowEnabled must be a boolean.`);
    }
    if (
      card.maxWidth !== undefined &&
      !CARD_WIDTH_STEPS.includes(
        card.maxWidth as (typeof CARD_WIDTH_STEPS)[number],
      )
    ) {
      throw new Error(`${path}.card.maxWidth must use a supported width stage.`);
    }
  }
}

function validateColorSource(value: unknown, path: string): void {
  if (value === undefined) return;
  if (
    typeof value !== "string" ||
    !(value === "auto" || PALETTE_KEYS.includes(value as (typeof PALETTE_KEYS)[number]) || HEX.test(value))
  ) {
    throw new Error(`${path} must be auto, a named palette color, or a hexadecimal color.`);
  }
}

function validateResolvedTheme(theme: ConfiguratorTheme, path: string): void {
  const resolved = resolveTheme(theme);
  const colors = [
    ...Object.values(resolved.palette),
    ...Object.values(resolved.grid),
    ...Object.values(resolved.protocol),
    resolved.background.start,
    resolved.background.end,
    ...resolved.background.blobs.colors,
    resolved.card.background,
    resolved.card.border,
    resolved.card.separator,
    resolved.headline.start,
    resolved.headline.end,
    resolved.service.icon,
    ...Object.values(resolved.text),
  ];
  if (colors.some((color) => !HEX.test(color))) {
    throw new Error(`${path} contains an invalid color.`);
  }
}

function mapping(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be a mapping.`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): void {
  const supported = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !supported.has(key));
  if (unknown) throw new Error(`${path}.${unknown} is unsupported.`);
}

function shortText(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) {
    throw new Error(`${path} must be a non-empty string with at most 80 characters.`);
  }
  return value.trim();
}
