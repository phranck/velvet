/**
 * Single source of truth for Velvet's shared layout geometry and type scale.
 *
 * These values drive BOTH the live Svelte UI (applied as CSS custom properties by
 * {@link applyTokens}) AND the build-time social card (`scripts/generate-og.ts`
 * imports them directly). Keeping them here means a layout tweak — a taller uptime
 * bar, a larger service name — updates the page and the OG image together, with no
 * duplicated constants that silently drift apart.
 *
 * All sizes are the live (1×) values in px. The social card renders on a larger
 * canvas and multiplies every value by {@link OG_SCALE}, so it stays a faithful
 * zoom of the live view rather than a separately hand-tuned copy.
 */

/** Uptime-bar geometry, mirrored by UptimeBar.svelte and the OG card. */
export const bar = {
  /** Bar-strip height in px. */
  height: 32,
  /** Gap between segments in px. */
  gap: 2,
  /** Corner radius (px) of a single-day segment in the default view. */
  radius: 2,
  /** Fully-rounded radius for the 90-day ("quarter") view; any large value reads as a capsule. */
  radiusFull: 999,
} as const;

/**
 * One stop of the glossy overlay each bar segment carries: a vertical light→dark
 * gradient laid over the status colour, giving the strip depth. Modelled as ordered
 * stops so the CSS (a `linear-gradient`) and the SVG (a `<linearGradient>`) render
 * identically from one definition.
 *
 * @property offset - position along the gradient, 0 (top) → 1 (bottom)
 * @property rgb - the stop colour as an `r, g, b` triplet
 * @property opacity - the stop's alpha
 */
export interface GlossStop {
  offset: number;
  rgb: string;
  opacity: number;
}
export const segGloss: readonly GlossStop[] = [
  { offset: 0, rgb: "255, 255, 255", opacity: 0.22 },
  { offset: 0.42, rgb: "255, 255, 255", opacity: 0.05 },
  { offset: 1, rgb: "0, 0, 0", opacity: 0.12 },
] as const;

/** Type scale (px) for the service row and hero, shared with the OG card. */
export const typeScale = {
  serviceName: 16.5,
  uptime: 14,
  proto: 11.5,
  labels: 13,
  serviceIcon: 22,
  headline: 38,
  heroIcon: 54,
} as const;

/** IPv4/IPv6 protocol pill, shared with the OG card. */
export const pill = {
  /** Diameter (px) of the status dot. */
  dot: 6,
  /** Translucent white fill opacity (so the pill reads as a shape). */
  bgOpacity: 0.06,
  /** Translucent white border opacity. */
  borderOpacity: 0.12,
} as const;

/** The social card renders at this multiple of the live (1×) sizes above. */
export const OG_SCALE = 1.4;

/** The segment gloss as a CSS `linear-gradient(...)` string for the live UI. */
export function segGlossCss(): string {
  const stops = segGloss.map((s) => `rgba(${s.rgb}, ${s.opacity}) ${s.offset * 100}%`).join(", ");
  return `linear-gradient(180deg, ${stops})`;
}

/**
 * The shared tokens as CSS custom properties (name → value), applied to the document
 * root so the component stylesheets can reference them via `var(--…)`. This is the
 * live-UI half of the single source of truth; the OG card consumes the same exports
 * directly. Colours stay in {@link applyTheme} (they come from the consumer's theme).
 */
export function tokenCssVars(): Record<string, string> {
  return {
    "--bar-height": `${bar.height}px`,
    "--bar-gap": `${bar.gap}px`,
    "--bar-radius": `${bar.radius}px`,
    "--bar-radius-full": `${bar.radiusFull}px`,
    "--seg-gloss": segGlossCss(),
    "--svc-name-size": `${typeScale.serviceName}px`,
    "--uptime-size": `${typeScale.uptime}px`,
    "--proto-size": `${typeScale.proto}px`,
    "--labels-size": `${typeScale.labels}px`,
    "--svc-icon-size": `${typeScale.serviceIcon}px`,
    "--headline-size": `${typeScale.headline}px`,
    "--hero-icon-size": `${typeScale.heroIcon}px`,
    "--proto-dot": `${pill.dot}px`,
    "--proto-bg": `rgba(255, 255, 255, ${pill.bgOpacity})`,
    "--proto-border": `rgba(255, 255, 255, ${pill.borderOpacity})`,
  };
}
