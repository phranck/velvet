import type { VelvetThemeInput } from "@velvet/contracts";

import { normalizeThemeConfiguration } from "./theme.js";

type ConfiguratorTheme = ReturnType<typeof normalizeThemeConfiguration>;

interface ThemeWithConfiguration {
  theme: ConfiguratorTheme;
}

/** Convert a complete Configurator theme into the IPv4-only v1 config. */
export function canonicalSystemTheme(
  theme: ThemeWithConfiguration,
): VelvetThemeInput {
  return canonicalConfiguratorTheme(theme.theme);
}

export function canonicalConfiguratorTheme(
  source: ConfiguratorTheme,
): VelvetThemeInput {
  return {
    name: source.name,
    palette: { ...source.palette },
    grid: { ...source.grid },
    chart: {
      line: source.protocol.ipv4,
      lineStyle: source.chart.ipv4LineStyle,
      fill: source.chart.fill,
      background: source.chart.background,
      backgroundOpacity: source.chart.backgroundOpacity,
    },
    background: {
      start: source.background.start,
      end: source.background.end,
      blobs: {
        enabled: source.background.blobs.enabled,
        count: source.background.blobs.count,
        colors: [...source.background.blobs.colors],
      },
    },
    card: {
      ...source.card,
      maxWidth: canonicalCardWidth(source.card.maxWidth),
    },
    headline: { ...source.headline },
    service: { ...source.service },
    text: { ...source.text },
  };
}

function canonicalCardWidth(value: number): 640 | 760 | 920 | 1080 {
  if (value === 640 || value === 760 || value === 920 || value === 1080) {
    return value;
  }
  throw new Error(`Unsupported card width: ${value}`);
}
