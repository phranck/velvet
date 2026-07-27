export const PALETTE_KEYS = /** @type {const} */ ([
  "canvas",
  "foreground",
  "accent",
  "alternate",
  "warning",
  "danger",
  "textPrimary",
  "textSecondary",
  "textTertiary",
]);

export const CARD_WIDTH_STEPS = /** @type {const} */ ([640, 760, 920, 1080]);

/** @typedef {(typeof PALETTE_KEYS)[number]} PaletteKey */
/** @typedef {"auto" | PaletteKey | string} ColorSource */
/** @typedef {{ canvas: string, foreground: string, accent: string, alternate: string, warning: string, danger: string, textPrimary: string, textSecondary: string, textTertiary: string }} ThemePalette */

/**
 * @typedef {object} ThemeInput
 * @property {string=} name
 * @property {Partial<ThemePalette>=} palette
 * @property {string=} accent
 * @property {string=} accentDeg
 * @property {string=} accentDown
 * @property {{ operational?: string, degraded?: string, outage?: string, noData?: string }=} grid
 * @property {{ ipv4?: string, ipv6?: string }=} protocol
 * @property {{ ipv4LineStyle?: string, ipv6LineStyle?: string, fill?: boolean, background?: string, backgroundOpacity?: number }=} chart
 * @property {{ start?: string, end?: string, blobs?: { enabled?: boolean, count?: number, colors?: readonly string[] } }=} background
 * @property {{ background?: string, border?: string, separator?: string, borderEnabled?: boolean, shadowEnabled?: boolean, radius?: number, padding?: number, maxWidth?: number }=} card
 * @property {{ start?: string, end?: string }=} headline
 * @property {{ icon?: string }=} service
 * @property {{ primary?: string, secondary?: string, tertiary?: string }=} text
 */

/**
 * @typedef {object} VelvetThemeConfiguration
 * @property {string} name
 * @property {ThemePalette} palette
 * @property {{ operational: ColorSource, degraded: ColorSource, outage: ColorSource, noData: ColorSource }} grid
 * @property {{ ipv4: ColorSource, ipv6: ColorSource }} protocol
 * @property {{ ipv4LineStyle: "solid" | "dashed" | "dotted", ipv6LineStyle: "solid" | "dashed" | "dotted", fill: boolean, background: ColorSource, backgroundOpacity: number }} chart
 * @property {{ start: ColorSource, end: ColorSource, blobs: { enabled: boolean, count: number, colors: [ColorSource, ColorSource] } }} background
 * @property {{ background: ColorSource, border: ColorSource, separator: ColorSource, borderEnabled: boolean, shadowEnabled: boolean, radius: number, padding: number, maxWidth: number }} card
 * @property {{ start: ColorSource, end: ColorSource }} headline
 * @property {{ icon: ColorSource }} service
 * @property {{ primary: ColorSource, secondary: ColorSource, tertiary: ColorSource }} text
 */

/**
 * @typedef {object} VelvetTheme
 * @property {string} name
 * @property {ThemePalette} palette
 * @property {{ operational: string, degraded: string, outage: string, noData: string }} grid
 * @property {{ ipv4: string, ipv6: string }} protocol
 * @property {{ ipv4LineStyle: "solid" | "dashed" | "dotted", ipv6LineStyle: "solid" | "dashed" | "dotted", fill: boolean, background: string, backgroundOpacity: number }} chart
 * @property {{ start: string, end: string, blobs: { enabled: boolean, count: number, colors: [string, string] } }} background
 * @property {{ background: string, border: string, separator: string, borderEnabled: boolean, shadowEnabled: boolean, radius: number, padding: number, maxWidth: number }} card
 * @property {{ start: string, end: string }} headline
 * @property {{ icon: string }} service
 * @property {string} accent
 * @property {{ primary: string, secondary: string, tertiary: string }} text
 */

const DEFAULT_PALETTE = /** @type {Readonly<ThemePalette>} */ (
  Object.freeze({
    canvas: "#0a0b0f",
    foreground: "#e8eaed",
    accent: "#6366f1",
    alternate: "#38bdf8",
    warning: "#d29922",
    danger: "#f85149",
    textPrimary: "#e8eaed",
    textSecondary: "#8b8c90",
    textTertiary: "#515256",
  })
);

/**
 * Convert legacy or partial theme input into the editable, reference-preserving
 * theme configuration used by the configurator and YAML document.
 *
 * @param {ThemeInput | VelvetThemeConfiguration} input
 * @returns {VelvetThemeConfiguration}
 */
export function normalizeThemeConfiguration(input = {}) {
  const legacy = /** @type {ThemeInput} */ (input);
  const canvas = color(input.palette?.canvas, DEFAULT_PALETTE.canvas);
  const foreground = color(input.palette?.foreground, DEFAULT_PALETTE.foreground);
  const palette = {
    canvas,
    foreground,
    accent: color(input.palette?.accent ?? legacy.accent, DEFAULT_PALETTE.accent),
    alternate: color(input.palette?.alternate, DEFAULT_PALETTE.alternate),
    warning: color(input.palette?.warning, DEFAULT_PALETTE.warning),
    danger: color(input.palette?.danger, DEFAULT_PALETTE.danger),
    textPrimary: color(input.palette?.textPrimary, foreground),
    textSecondary: color(
      input.palette?.textSecondary,
      mixHex(foreground, canvas, 0.42),
    ),
    textTertiary: color(
      input.palette?.textTertiary,
      mixHex(foreground, canvas, 0.68),
    ),
  };

  return {
    name:
      typeof input.name === "string" && input.name.trim()
        ? input.name.trim()
        : "Velvet Default",
    palette,
    grid: {
      operational: colorSource(input.grid?.operational),
      degraded: colorSource(input.grid?.degraded ?? legacy.accentDeg),
      outage: colorSource(input.grid?.outage ?? legacy.accentDown),
      noData: colorSource(input.grid?.noData),
    },
    protocol: {
      ipv4: colorSource(input.protocol?.ipv4),
      ipv6: colorSource(input.protocol?.ipv6),
    },
    chart: {
      ipv4LineStyle: lineStyle(input.chart?.ipv4LineStyle, "solid"),
      ipv6LineStyle: lineStyle(input.chart?.ipv6LineStyle, "dashed"),
      fill: input.chart?.fill ?? false,
      background: colorSource(input.chart?.background),
      backgroundOpacity: clampOpacity(input.chart?.backgroundOpacity),
    },
    background: {
      start: colorSource(input.background?.start),
      end: colorSource(input.background?.end),
      blobs: {
        enabled: input.background?.blobs?.enabled ?? true,
        count: clampBlobCount(input.background?.blobs?.count),
        colors: [
          colorSource(input.background?.blobs?.colors?.[0]),
          colorSource(input.background?.blobs?.colors?.[1]),
        ],
      },
    },
    card: {
      background: colorSource(input.card?.background),
      border: colorSource(input.card?.border),
      separator: colorSource(input.card?.separator),
      borderEnabled: input.card?.borderEnabled ?? true,
      shadowEnabled: input.card?.shadowEnabled ?? true,
      radius: clampDimension(input.card?.radius, 14),
      padding: clampDimension(input.card?.padding, 16),
      maxWidth: cardWidth(input.card?.maxWidth),
    },
    headline: {
      start: colorSource(input.headline?.start),
      end: colorSource(input.headline?.end),
    },
    service: {
      icon: colorSource(input.service?.icon),
    },
    text: {
      primary: colorSource(input.text?.primary),
      secondary: colorSource(input.text?.secondary),
      tertiary: colorSource(input.text?.tertiary),
    },
  };
}

/**
 * @param {ThemeInput | VelvetThemeConfiguration} input
 * @returns {VelvetTheme}
 */
export function resolveTheme(input = {}) {
  const configuration = normalizeThemeConfiguration(input);
  const { palette } = configuration;
  const subtleSurface = mixHex(palette.canvas, palette.foreground, 0.02);
  const quietLine = mixHex(palette.canvas, palette.foreground, 0.04);
  const visibleLine = mixHex(palette.canvas, palette.foreground, 0.08);

  return {
    name: configuration.name,
    palette,
    grid: {
      operational: resolveColorSource(
        configuration.grid.operational,
        palette,
        palette.accent,
      ),
      degraded: resolveColorSource(
        configuration.grid.degraded,
        palette,
        palette.warning,
      ),
      outage: resolveColorSource(
        configuration.grid.outage,
        palette,
        palette.danger,
      ),
      noData: resolveColorSource(
        configuration.grid.noData,
        palette,
        visibleLine,
      ),
    },
    protocol: {
      ipv4: resolveColorSource(
        configuration.protocol.ipv4,
        palette,
        palette.accent,
      ),
      ipv6: resolveColorSource(
        configuration.protocol.ipv6,
        palette,
        palette.alternate,
      ),
    },
    chart: {
      ipv4LineStyle: configuration.chart.ipv4LineStyle,
      ipv6LineStyle: configuration.chart.ipv6LineStyle,
      fill: configuration.chart.fill,
      background: resolveColorSource(
        configuration.chart.background,
        palette,
        palette.canvas,
      ),
      backgroundOpacity: configuration.chart.backgroundOpacity,
    },
    background: {
      start: resolveColorSource(
        configuration.background.start,
        palette,
        subtleSurface,
      ),
      end: resolveColorSource(
        configuration.background.end,
        palette,
        palette.canvas,
      ),
      blobs: {
        enabled: configuration.background.blobs.enabled,
        count: configuration.background.blobs.count,
        colors: [
          resolveColorSource(
            configuration.background.blobs.colors[0],
            palette,
            palette.accent,
          ),
          resolveColorSource(
            configuration.background.blobs.colors[1],
            palette,
            palette.alternate,
          ),
        ],
      },
    },
    card: {
      background: resolveColorSource(
        configuration.card.background,
        palette,
        subtleSurface,
      ),
      border: resolveColorSource(
        configuration.card.border,
        palette,
        visibleLine,
      ),
      separator: resolveColorSource(
        configuration.card.separator,
        palette,
        quietLine,
      ),
      borderEnabled: configuration.card.borderEnabled,
      shadowEnabled: configuration.card.shadowEnabled,
      radius: configuration.card.radius,
      padding: configuration.card.padding,
      maxWidth: configuration.card.maxWidth,
    },
    headline: {
      start: resolveColorSource(
        configuration.headline.start,
        palette,
        palette.textPrimary,
      ),
      end: resolveColorSource(
        configuration.headline.end,
        palette,
        palette.textSecondary,
      ),
    },
    service: {
      icon: resolveColorSource(
        configuration.service.icon,
        palette,
        palette.accent,
      ),
    },
    accent: palette.accent,
    text: {
      primary: resolveColorSource(
        configuration.text.primary,
        palette,
        palette.textPrimary,
      ),
      secondary: resolveColorSource(
        configuration.text.secondary,
        palette,
        palette.textSecondary,
      ),
      tertiary: resolveColorSource(
        configuration.text.tertiary,
        palette,
        palette.textTertiary,
      ),
    },
  };
}

/** @type {Readonly<VelvetTheme>} */
export const DEFAULT_THEME = Object.freeze(resolveTheme());

/**
 * @param {VelvetTheme} theme
 * @param {string} seed
 * @returns {Record<string, string>}
 */
export function themeCssVariables(theme, seed) {
  return {
    "--accent": theme.accent,
    "--grid-operational": theme.grid.operational,
    "--grid-degraded": theme.grid.degraded,
    "--grid-outage": theme.grid.outage,
    "--grid-no-data": theme.grid.noData,
    "--protocol-ipv4": theme.protocol.ipv4,
    "--protocol-ipv6": theme.protocol.ipv6,
    "--chart-background": theme.chart.background,
    "--chart-background-opacity": String(theme.chart.backgroundOpacity),
    "--background-start": theme.background.start,
    "--background-end": theme.background.end,
    "--cloudy-blobs": theme.background.blobs.enabled
      ? cloudyBlobBackground(theme.background.blobs, seed)
      : "none",
    "--card-background": theme.card.background,
    "--card-border": theme.card.border,
    "--card-separator": theme.card.separator,
    "--card-border-width": theme.card.borderEnabled ? "1px" : "0px",
    "--card-shadow": theme.card.shadowEnabled
      ? "0 1px 3px rgba(0, 0, 0, 0.25), 0 6px 16px rgba(0, 0, 0, 0.22)"
      : "none",
    "--card-radius": `${theme.card.radius}px`,
    "--card-padding": `${theme.card.padding}px`,
    "--service-card-max-width": `${theme.card.maxWidth}px`,
    "--headline-start": theme.headline.start,
    "--headline-end": theme.headline.end,
    "--service-icon": theme.service.icon,
    "--text-primary": theme.text.primary,
    "--text-secondary": theme.text.secondary,
    "--text-tertiary": theme.text.tertiary,
  };
}

/**
 * @param {VelvetTheme["background"]["blobs"]} blobs
 * @param {string} seed
 */
function cloudyBlobBackground(blobs, seed) {
  return cloudyBlobLayout(blobs, seed)
    .map(
      ({ width, height, x, y, color: colorValue, strength }) =>
        `radial-gradient(${width}% ${height}% at ${x}% ${y}%, color-mix(in srgb, ${colorValue} ${strength}%, transparent), transparent 70%)`,
    )
    .join(", ");
}

/**
 * @param {VelvetTheme["background"]["blobs"]} blobs
 * @param {string} seed
 * @returns {Array<{ x: string, y: string, width: number, height: number, strength: number, color: string }>}
 */
export function cloudyBlobLayout(blobs, seed) {
  const seedHash = hash(seed);
  const startAngle = (seedHash % 360) * (Math.PI / 180);
  const goldenAngle = 137.508 * (Math.PI / 180);

  return Array.from({ length: blobs.count }, (_, index) => {
    const angle = startAngle + index * goldenAngle;
    const radius = 18 + ((seedHash >>> ((index % 4) * 8)) % 22);
    const width = 36 + ((seedHash + index * 17) % 24);
    return {
      x: (50 + Math.cos(angle) * radius).toFixed(1),
      y: (43 + Math.sin(angle) * radius * 0.68).toFixed(1),
      width,
      height: Math.round(width * 0.78),
      strength: 8 + ((seedHash + index * 11) % 6),
      color: blobs.colors[index % blobs.colors.length],
    };
  });
}

/**
 * @param {string} value
 */
function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/**
 * @param {unknown} value
 * @param {string} fallback
 */
function color(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * Resolve a palette reference or custom hexadecimal value to a concrete color.
 * The `auto` sentinel keeps the role linked to its semantic default.
 *
 * @param {ColorSource} source
 * @param {ThemePalette} palette
 * @param {string} automatic
 */
export function resolveColorSource(source, palette, automatic) {
  if (source === "auto") return automatic;
  if (PALETTE_KEYS.includes(/** @type {PaletteKey} */ (source))) {
    return palette[/** @type {PaletteKey} */ (source)];
  }
  return color(source, automatic);
}

/**
 * @param {unknown} value
 * @returns {ColorSource}
 */
function colorSource(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "auto";
}

/**
 * @param {unknown} value
 * @param {"solid" | "dashed" | "dotted"} fallback
 */
function lineStyle(value, fallback) {
  return value === "solid" || value === "dashed" || value === "dotted"
    ? value
    : fallback;
}

/**
 * @param {number | undefined} value
 */
function clampBlobCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 3;
  }

  return Math.min(5, Math.max(1, Math.round(value)));
}

/**
 * @param {number | undefined} value
 * @param {number} fallback
 */
function clampDimension(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(32, Math.max(0, Math.round(value)));
}

/**
 * @param {number | undefined} value
 */
function clampOpacity(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * @param {number | undefined} value
 */
function cardWidth(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 760;
  return CARD_WIDTH_STEPS.reduce((closest, step) =>
    Math.abs(step - value) < Math.abs(closest - value) ? step : closest,
  );
}

/**
 * @param {string} from
 * @param {string} to
 * @param {number} amount
 */
function mixHex(from, to, amount) {
  const fromRgb = parseHex(from);
  const toRgb = parseHex(to);
  if (!fromRgb || !toRgb) return from;

  const channel = (/** @type {number} */ start, /** @type {number} */ end) =>
    Math.round(start + (end - start) * amount)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(fromRgb[0], toRgb[0])}${channel(fromRgb[1], toRgb[1])}${channel(fromRgb[2], toRgb[2])}`;
}

/**
 * @param {string} value
 * @returns {[number, number, number] | null}
 */
function parseHex(value) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!match) return null;
  return [
    Number.parseInt(match[1], 16),
    Number.parseInt(match[2], 16),
    Number.parseInt(match[3], 16),
  ];
}
