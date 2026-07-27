/**
 * @typedef {object} VelvetTheme
 * @property {{ operational: string, degraded: string, outage: string, noData: string }} grid
 * @property {{ ipv4: string, ipv6: string }} protocol
 * @property {{ start: string, end: string, blobs: { enabled: boolean, count: number, colors: readonly [string, string] } }} background
 * @property {{ background: string, border: string, separator: string, borderEnabled: boolean }} card
 * @property {string} accent
 * @property {{ primary: string, secondary: string, tertiary: string }} text
 */

/**
 * @typedef {object} ThemeInput
 * @property {string=} accent
 * @property {string=} accentDeg
 * @property {string=} accentDown
 * @property {{ operational?: string, degraded?: string, outage?: string, noData?: string }=} grid
 * @property {{ ipv4?: string, ipv6?: string }=} protocol
 * @property {{ start?: string, end?: string, blobs?: { enabled?: boolean, count?: number, colors?: readonly string[] } }=} background
 * @property {{ background?: string, border?: string, separator?: string, borderEnabled?: boolean }=} card
 * @property {{ primary?: string, secondary?: string, tertiary?: string }=} text
 */

/** @type {Readonly<VelvetTheme>} */
export const DEFAULT_THEME = Object.freeze({
  grid: Object.freeze({
    operational: "#6366f1",
    degraded: "#d29922",
    outage: "#f85149",
    noData: "#1c2029",
  }),
  protocol: Object.freeze({
    ipv4: "#7c7ef3",
    ipv6: "#38bdf8",
  }),
  background: Object.freeze({
    start: "#0e1018",
    end: "#0a0b0f",
    blobs: Object.freeze({
      enabled: true,
      count: 3,
      colors: /** @type {readonly [string, string]} */ (
        Object.freeze(["#6366f1", "#7c7ef3"])
      ),
    }),
  }),
  card: Object.freeze({
    background: "#0e1015",
    border: "#1c2029",
    separator: "#14171f",
    borderEnabled: true,
  }),
  accent: "#6366f1",
  text: Object.freeze({
    primary: "#e8eaed",
    secondary: "#8b919b",
    tertiary: "#565b65",
  }),
});

/**
 * @returns {VelvetTheme}
 */
export function resolveTheme(input = /** @type {ThemeInput} */ ({})) {
  const accent = color(input.accent, DEFAULT_THEME.accent);
  const accentBright = mixHex(accent, "#ffffff", 0.16);

  return {
    grid: {
      operational: color(input.grid?.operational, accent),
      degraded: color(
        input.grid?.degraded ?? input.accentDeg,
        DEFAULT_THEME.grid.degraded,
      ),
      outage: color(
        input.grid?.outage ?? input.accentDown,
        DEFAULT_THEME.grid.outage,
      ),
      noData: color(input.grid?.noData, DEFAULT_THEME.grid.noData),
    },
    protocol: {
      ipv4: color(input.protocol?.ipv4, accentBright),
      ipv6: color(input.protocol?.ipv6, DEFAULT_THEME.protocol.ipv6),
    },
    background: {
      start: color(input.background?.start, DEFAULT_THEME.background.start),
      end: color(input.background?.end, DEFAULT_THEME.background.end),
      blobs: {
        enabled:
          input.background?.blobs?.enabled ??
          DEFAULT_THEME.background.blobs.enabled,
        count: clampBlobCount(input.background?.blobs?.count),
        colors: resolveBlobColors(
          input.background?.blobs?.colors,
          accent,
          accentBright,
        ),
      },
    },
    card: {
      background: color(
        input.card?.background,
        DEFAULT_THEME.card.background,
      ),
      border: color(input.card?.border, DEFAULT_THEME.card.border),
      separator: color(input.card?.separator, DEFAULT_THEME.card.separator),
      borderEnabled:
        input.card?.borderEnabled ?? DEFAULT_THEME.card.borderEnabled,
    },
    accent,
    text: {
      primary: color(input.text?.primary, DEFAULT_THEME.text.primary),
      secondary: color(input.text?.secondary, DEFAULT_THEME.text.secondary),
      tertiary: color(input.text?.tertiary, DEFAULT_THEME.text.tertiary),
    },
  };
}

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
    "--background-start": theme.background.start,
    "--background-end": theme.background.end,
    "--cloudy-blobs": theme.background.blobs.enabled
      ? cloudyBlobBackground(theme.background.blobs, seed)
      : "none",
    "--card-background": theme.card.background,
    "--card-border": theme.card.border,
    "--card-separator": theme.card.separator,
    "--card-border-width": theme.card.borderEnabled ? "1px" : "0px",
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
 * @param {number | undefined} value
 */
function clampBlobCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_THEME.background.blobs.count;
  }

  return Math.min(5, Math.max(1, Math.round(value)));
}

/**
 * @param {readonly string[] | undefined} values
 * @param {string} firstFallback
 * @param {string} secondFallback
 * @returns {[string, string]}
 */
function resolveBlobColors(values, firstFallback, secondFallback) {
  return [
    color(values?.[0], firstFallback),
    color(values?.[1], secondFallback),
  ];
}

/**
 * @param {string} from
 * @param {string} to
 * @param {number} amount
 */
function mixHex(from, to, amount) {
  const fromRgb = parseHex(from);
  const toRgb = parseHex(to);
  if (!fromRgb || !toRgb) return DEFAULT_THEME.grid.operational;

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
