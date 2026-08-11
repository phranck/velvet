/**
 * Reading a theme's values back out of the stylesheet.
 *
 * Two things a status page draws are not laid out by CSS. The availability
 * strip is a canvas, and the response chart is an SVG whose geometry is
 * arithmetic rather than a set of boxes. Neither understands `var()` or
 * `color-mix()`, so both have to ask the document what the current theme
 * resolved a property to.
 *
 * `site/src/components/UptimeBar.svelte` already does this for colour, through
 * hidden probe elements whose backgrounds carry the palette. It does not do it
 * for geometry, which is imported from `site/src/lib/tokens.ts` as TypeScript
 * constants, and that is exactly why a theme cannot currently change the shape
 * of a segment. This module closes that gap, and
 * `documentation/theme-authoring.md` lists it as the first prerequisite.
 *
 * Everything here reads through `getComputedStyle`, so a value arrives fully
 * resolved: a `calc()` has been evaluated, a `color-mix()` has been mixed, and
 * a custom property pointing at another custom property has been followed.
 */

/**
 * A resolved custom property as its raw string.
 *
 * @param element - The element to resolve against, since a property may be
 *   overridden on a subtree rather than only on the root.
 * @param name - The property, written with its leading double hyphen.
 * @returns The resolved value, or an empty string where nothing defines it.
 */
export function readRaw(element: Element, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

/**
 * A resolved custom property as a number of CSS pixels.
 *
 * Values reach this as strings with a unit, and lengths in a theme may be
 * written in any unit the author prefers. Rather than parsing them, the value
 * is assigned to a probe and measured, so `1.5rem`, `12px` and
 * `calc(2ch + 1px)` all answer in the same currency.
 *
 * @param element - The element to resolve against.
 * @param name - The property, written with its leading double hyphen.
 * @param fallback - Used where the property is absent or resolves to something
 *   that is not a length.
 * @returns The length in CSS pixels.
 */
export function readLength(
  element: Element,
  name: string,
  fallback: number,
): number {
  const raw = readRaw(element, name);
  if (raw === "") return fallback;

  const asNumber = Number.parseFloat(raw);
  if (raw.endsWith("px") && Number.isFinite(asNumber)) return asNumber;

  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.width = raw;
  element.append(probe);
  const measured = probe.getBoundingClientRect().width;
  probe.remove();
  return Number.isFinite(measured) && measured > 0 ? measured : fallback;
}

/**
 * A resolved custom property as a plain number, for values that carry no unit.
 *
 * @param element - The element to resolve against.
 * @param name - The property, written with its leading double hyphen.
 * @param fallback - Used where the property is absent or unparseable.
 * @returns The number.
 */
export function readNumber(
  element: Element,
  name: string,
  fallback: number,
): number {
  const value = Number.parseFloat(readRaw(element, name));
  return Number.isFinite(value) ? value : fallback;
}

/**
 * A colour resolved to something a canvas can paint with.
 *
 * A canvas rejects `var(--x)` and `color-mix(...)` alike, so the value is put
 * onto a probe as a background and read back. The browser hands it over as
 * `rgb(...)` or `rgba(...)`, which is what `fillStyle` and `strokeStyle` want.
 *
 * @param element - The element to resolve against.
 * @param name - The property, written with its leading double hyphen.
 * @returns The colour in a form a canvas accepts, or `transparent`.
 */
export function readColour(element: Element, name: string): string {
  const raw = readRaw(element, name);
  if (raw === "") return "transparent";

  const probe = document.createElement("div");
  probe.style.display = "none";
  probe.style.backgroundColor = raw;
  element.append(probe);
  const resolved = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return resolved === "" ? "transparent" : resolved;
}

/**
 * Every value the availability strip needs in order to draw itself.
 *
 * Gathered in one call rather than property by property, because each read
 * costs a style resolution and the strip redraws on hover.
 */
export interface StripTokens {
  height: number;
  hoverHeight: number;
  gap: number;
  radius: number;
  narrowRadius: number;
  gloss: boolean;
  /** Where a segment sits in the track: centred, or grown from one edge. */
  align: "center" | "top" | "bottom";
  /** How many stacked pieces one segment is drawn as. One is a solid bar. */
  pieces: number;
  /** The gap between those pieces. */
  pieceGap: number;
  /**
   * The radius of the track's own two ends.
   *
   * A strip whose segments all share one radius reads as a row of separate
   * objects. Rounding only the outer ends of the first and last segment makes
   * the same segments read as one divided bar, which is what an instrument
   * readout does.
   */
  trackRadius: number;
  operational: string;
  degraded: string;
  outage: string;
  noData: string;
  maintenance: string;
  maintenanceEdge: string;
  ghostEdge: string;
}

/**
 * Where a segment sits in the track.
 *
 * `center` keeps the strip symmetrical, which is what a history bar usually
 * does. `bottom` makes it grow from a baseline, which is what a bar-graph
 * meter does and what a segment lifted under the pointer then rises out of.
 *
 * @param element - The strip, to resolve against.
 * @returns One of the three keywords, defaulting to `center`.
 */
function readAlign(element: Element): StripTokens["align"] {
  const raw = readRaw(element, "--bar-align");
  return raw === "top" || raw === "bottom" ? raw : "center";
}

/**
 * Reads the strip's whole token set.
 *
 * The fallbacks match the values in `site/src/lib/tokens.ts`, so a document
 * that defines nothing still draws the strip the product draws today rather
 * than collapsing to zero.
 *
 * @param element - The strip, so a theme may override any of these on a
 *   subtree rather than only at the root.
 * @returns The resolved token set.
 */
export function readStripTokens(element: Element): StripTokens {
  return {
    height: readLength(element, "--bar-height", 32),
    hoverHeight: readLength(element, "--bar-hover-height", 38),
    gap: readLength(element, "--bar-gap", 2),
    radius: readLength(element, "--bar-radius", 2),
    narrowRadius: readLength(element, "--bar-radius-narrow", 999),
    // A gloss is a gradient, and the only thing the canvas needs to know is
    // whether to lay one on at all. Themes that want none set the property to
    // the keyword rather than to an empty gradient.
    gloss: readRaw(element, "--seg-gloss") !== "none",
    align: readAlign(element),
    // Clamped, because a fractional or absurd count would produce pieces too
    // small to see rather than an error anybody would notice.
    pieces: Math.max(1, Math.min(8, Math.round(readNumber(element, "--bar-pieces", 1)))),
    pieceGap: readLength(element, "--bar-piece-gap", 2),
    trackRadius: readLength(element, "--bar-track-radius", 0),
    operational: readColour(element, "--state-operational"),
    degraded: readColour(element, "--state-degraded"),
    outage: readColour(element, "--state-outage"),
    noData: readColour(element, "--state-no-data"),
    maintenance: readColour(element, "--state-maintenance"),
    maintenanceEdge: readColour(element, "--state-maintenance-edge"),
    ghostEdge: readColour(element, "--state-ghost-edge"),
  };
}

/** Every value the response chart needs in order to lay itself out. */
export interface ChartTokens {
  height: number;
  insetInline: number;
  insetBlock: number;
  gridLines: number;
  lineWidth: number;
  pointRadius: number;
  tooltipWidth: number;
  fill: number;
  /** How far apart the ticks of a printed scale stand. Zero draws none. */
  tickStep: number;
  /** Every how many ticks a long one is drawn. */
  tickMajorEvery: number;
  tickMinor: number;
  tickMajor: number;
}

/**
 * Reads the chart's whole token set.
 *
 * The fallbacks match the constants in
 * `site/src/components/service/ResponseTimeChart.svelte`, which is what these
 * replace.
 *
 * @param element - The chart's container.
 * @returns The resolved token set.
 */
export function readChartTokens(element: Element): ChartTokens {
  return {
    height: readLength(element, "--chart-height", 148),
    insetInline: readLength(element, "--chart-inset-inline", 12),
    insetBlock: readLength(element, "--chart-inset-block", 12),
    gridLines: readNumber(element, "--chart-grid-lines", 3),
    lineWidth: readLength(element, "--chart-line-width", 2),
    pointRadius: readLength(element, "--chart-point-radius", 3),
    tooltipWidth: readLength(element, "--chart-tooltip-width", 136),
    fill: readNumber(element, "--chart-fill", 0),
    tickStep: readLength(element, "--chart-tick-step", 0),
    tickMajorEvery: readNumber(element, "--chart-tick-major-every", 4),
    tickMinor: readLength(element, "--chart-tick-minor", 0),
    tickMajor: readLength(element, "--chart-tick-major", 0),
  };
}
