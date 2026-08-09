/**
 * The daily availability strip, drawn on a canvas that reads its own shape from
 * the current theme.
 *
 * This follows `site/src/components/UptimeBar.svelte` closely, and departs from
 * it in exactly one respect: where that component imports its geometry from
 * `site/src/lib/tokens.ts` as TypeScript constants, this one reads the same
 * names back out of the stylesheet through `read-tokens.ts`. That single change
 * is what lets a theme file decide whether a day is a square tick, a rounded
 * box, or a capsule.
 *
 * The canvas itself is not a stylistic choice and is kept deliberately. A
 * quarter of a year is 90 segments for each service, and 90 rounded boxes are
 * re-rasterised by everything that repaints the page. The measurement recorded
 * in that component is 695ms of rasterisation as elements against 315ms as a
 * canvas, over six expand-all cycles at 90 days with four services.
 */

import { createOverlay } from "./overlay.js";
import type { DayStatus, RangeKey } from "../src/lib/types.js";
import { readStripTokens, type StripTokens } from "./read-tokens.js";

/*
 * Built once rather than per call. `toLocaleDateString(value, options)`
 * constructs a formatter every time it runs, and a year is 53 buckets for each
 * service whilst the tooltip is rebuilt on every pointer move.
 */
const SHORT_DATE = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
});
const FULL_DATE = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const MAINTENANCE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Which state colour a day is painted in.
 *
 * The order matters and is taken from the component this mirrors. A day nothing
 * was measured on takes the no-data colour whatever its recorded status says,
 * because such a day can still be recorded as operational and reading the
 * status first would paint an empty day as a working one.
 *
 * @param day - The day to colour.
 * @param tokens - The resolved palette.
 * @returns A colour the canvas can paint with.
 */
function statusColour(day: DayStatus, tokens: StripTokens): string {
  if (day.maintenance.length > 0 && day.status === "operational") {
    return tokens.maintenance;
  }
  if (!day.hasData && day.maintenance.length === 0) return tokens.noData;
  if (day.status === "operational") return tokens.operational;
  if (day.status === "unknown") return tokens.noData;
  if (day.status === "degraded") return tokens.degraded;
  return tokens.outage;
}

/**
 * What a day says about itself, in words.
 *
 * @param day - The day to describe.
 * @returns A short phrase naming the state and, where there was downtime, how
 *   much of it there was.
 */
function label(day: DayStatus): string {
  if (!day.hasData) return "no data";
  if (day.status === "operational") return "operational";
  if (day.status === "unknown") return "status unknown";
  if (day.status === "degraded") return `degraded · ${day.minutesDown} min down`;
  return `outage · ${day.minutesDown} min`;
}

/**
 * Every maintenance window covering a day, named with its span.
 *
 * @param day - The day to describe.
 * @returns One line per window, or an empty string where there is none.
 */
function maintenanceLabel(day: DayStatus): string {
  return day.maintenance
    .map(
      (event) =>
        `Maintenance: ${event.title}\n${MAINTENANCE_TIME.format(new Date(event.startsAt))} – ${MAINTENANCE_TIME.format(new Date(event.endsAt))}`,
    )
    .join("\n");
}

/**
 * The whole tooltip for a day.
 *
 * A bucket covering more than one day names its span rather than a single
 * date, which is the case the year range produces: 365 days are grouped in
 * sevens by `barsForRange`, so a bar there is a week.
 *
 * @param day - The day or bucket under the pointer.
 * @returns The tooltip text, with its lines separated by newlines.
 */
export function tooltipFor(day: DayStatus): string {
  const end = new Date(`${day.date}T00:00:00Z`);
  if (day.spanDays > 1) {
    const start = new Date(end.getTime() - (day.spanDays - 1) * 86_400_000);
    return [
      `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`,
      label(day),
      maintenanceLabel(day),
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [FULL_DATE.format(end), label(day), maintenanceLabel(day)]
    .filter(Boolean)
    .join("\n");
}

/**
 * What the drawing says as one sentence, for a reader who hears the page.
 *
 * A canvas carries no structure a screen reader can walk, so the whole strip is
 * summarised on the element that holds it.
 *
 * @param days - The days being drawn.
 * @returns A sentence counting the days by state.
 */
function summarise(days: DayStatus[]): string {
  const counted: Record<string, number> = {};
  for (const day of days) {
    const name = day.maintenance.length > 0 ? "under maintenance" : label(day);
    const key = name.split(" · ")[0]!;
    counted[key] = (counted[key] ?? 0) + 1;
  }
  const parts = Object.entries(counted)
    .sort((left, right) => right[1] - left[1])
    .map(([name, count]) => `${count} ${name}`);
  return parts.length === 0
    ? "Availability history: nothing recorded yet."
    : `Availability history: ${parts.join(", ")}.`;
}

/** Where a segment sits along the strip, in CSS pixels. */
function slot(index: number, total: number, width: number, gap: number) {
  const each = (width - gap * (total - 1)) / total;
  return { x: index * (each + gap), width: each };
}

/** The segment under a pointer at this offset, or null past either end. */
function segmentAt(
  offsetX: number,
  total: number,
  width: number,
  gap: number,
): number | null {
  if (total === 0 || width <= 0) return null;
  const each = (width - gap * (total - 1)) / total;
  const index = Math.floor(offsetX / (each + gap));
  return index >= 0 && index < total ? index : null;
}

/** What a caller gets back, so it can hand the strip new days on a range change. */
export interface UptimeStrip {
  update(days: DayStatus[], range: RangeKey): void;
  destroy(): void;
}

/**
 * Builds a strip inside the given host element.
 *
 * The host keeps its own size; the canvas fills it and is redrawn whenever the
 * width, the device pixel ratio, the hovered segment, or the theme changes.
 *
 * @param host - The element the strip is drawn into. It is emptied first.
 * @returns Handles for updating and tearing the strip down.
 */
export function createUptimeStrip(host: HTMLElement): UptimeStrip {
  host.textContent = "";
  host.classList.add("uptime-strip");
  host.setAttribute("role", "img");

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  // On the document's own layer rather than inside the strip, so no card can
  // clip it. See `overlay.ts` for the measurements that forced this.
  const tooltip = createOverlay("uptime-tooltip");
  const hiddenList = document.createElement("ul");
  hiddenList.className = "visually-hidden";
  host.append(canvas, hiddenList);

  let days: DayStatus[] = [];
  let range: RangeKey = "month";
  let hovered: number | null = null;
  let width = 0;
  let ratio = 1;

  /**
   * Draws the whole strip once.
   *
   * The tokens are read on every paint rather than cached, because switching
   * the theme changes them without changing anything this module is told
   * about. A paint happens on hover and on resize, which is far from a
   * per-frame path, so the reads are not on a hot loop.
   */
  function paint(): void {
    const context = canvas.getContext("2d");
    if (!context || width <= 0) return;

    const tokens = readStripTokens(host);
    // Taller than the strip, because the segment under the pointer stands past
    // it and a canvas clips at its own edge. A pixel either side keeps the
    // softened edge of a raised segment from being cut by the boundary.
    const surfaceHeight = tokens.hoverHeight + 2;
    host.style.setProperty("--strip-surface-height", `${surfaceHeight}px`);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(surfaceHeight * ratio);
    canvas.style.width = "100%";
    canvas.style.height = `${surfaceHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, surfaceHeight);

    const gloss = context.createLinearGradient(
      0,
      (surfaceHeight - tokens.height) / 2,
      0,
      (surfaceHeight + tokens.height) / 2,
    );
    gloss.addColorStop(0, "rgba(255, 255, 255, 0.22)");
    gloss.addColorStop(0.42, "rgba(255, 255, 255, 0.05)");
    gloss.addColorStop(1, "rgba(0, 0, 0, 0.12)");

    // The 90-day view packs the strip with three times as many segments as the
    // 30-day one, so each is about a quarter as wide and takes the narrow
    // radius. The year view does not, and that is not an oversight: 365 days
    // are grouped into 53 weekly buckets by `barsForRange`, which makes each
    // bar roughly twice as wide as a 90-day one. This follows
    // `site/src/components/UptimeBar.svelte:54` exactly, so a mockup cannot
    // show a segment shape the product would not draw.
    const radius = range === "quarter" ? tokens.narrowRadius : tokens.radius;

    days.forEach((day, index) => {
      const place = slot(index, days.length, width, tokens.gap);
      const lifted = index === hovered;
      const drawnHeight = lifted ? tokens.hoverHeight : tokens.height;
      // Where the segment sits in the track. Centred keeps the strip
      // symmetrical and lets a segment under the pointer grow both ways;
      // anchored to an edge it grows only away from that edge, which is what a
      // bar-graph meter does and reads as a reading rather than as a history.
      const y =
        tokens.align === "bottom"
          ? surfaceHeight - drawnHeight - 1
          : tokens.align === "top"
            ? 1
            : (surfaceHeight - drawnHeight) / 2;
      // A day nothing was measured on carries an edge instead of the gloss:
      // nothing was recorded, so there is no surface to catch light.
      const empty = !day.hasData && day.maintenance.length === 0;
      const colour = statusColour(day, tokens);
      const edge = empty
        ? tokens.ghostEdge
        : day.maintenance.length > 0
          ? tokens.maintenanceEdge
          : null;

      // One segment may be drawn as a stack of shorter pieces, which turns a
      // solid bar into a column of blocks without changing what it says.
      const pieceHeight =
        (drawnHeight - tokens.pieceGap * (tokens.pieces - 1)) / tokens.pieces;
      if (pieceHeight <= 0) return;
      const fitted = Math.min(radius, place.width / 2, pieceHeight / 2);
      // The track's own ends. Only the outer corners of the first and last
      // segment take it, so a row of segments reads as one divided bar rather
      // than as a row of separate objects.
      const cap = Math.min(
        tokens.trackRadius,
        place.width,
        pieceHeight / 2,
      );
      const first = index === 0 ? cap : fitted;
      const last = index === days.length - 1 ? cap : fitted;

      for (let piece = 0; piece < tokens.pieces; piece += 1) {
        const pieceY = y + piece * (pieceHeight + tokens.pieceGap);
        context.beginPath();
        context.roundRect(place.x, pieceY, place.width, pieceHeight, [
          first,
          last,
          last,
          first,
        ]);
        context.fillStyle = colour;
        context.fill();
        if (!empty && tokens.gloss) {
          context.fillStyle = gloss;
          context.fill();
        }
        if (!edge) continue;
        context.beginPath();
        context.roundRect(
          place.x + 0.5,
          pieceY + 0.5,
          Math.max(place.width - 1, 0),
          Math.max(pieceHeight - 1, 0),
          [
            Math.max(first - 0.5, 0),
            Math.max(last - 0.5, 0),
            Math.max(last - 0.5, 0),
            Math.max(first - 0.5, 0),
          ],
        );
        context.strokeStyle = edge;
        context.lineWidth = 1;
        context.stroke();
      }
    });
  }

  /**
   * Shows the tooltip over the hovered segment, or hides it.
   *
   * The anchor is a function rather than a value, because the overlay re-reads
   * it whenever the page scrolls: the segment moves and nothing else would
   * tell the overlay to follow.
   */
  function placeTooltip(): void {
    if (hovered === null || !days[hovered]) {
      tooltip.hide();
      return;
    }
    const index = hovered;
    tooltip.show(tooltipFor(days[index]!), () => {
      if (hovered !== index) return null;
      const box = host.getBoundingClientRect();
      const gap = readStripTokens(host).gap;
      const place = slot(index, days.length, box.width, gap);
      return {
        rect: new DOMRect(box.left + place.x, box.top, place.width, box.height),
        side: "above",
      };
    });
  }

  function onPointerMove(event: PointerEvent): void {
    const box = host.getBoundingClientRect();
    const gap = readStripTokens(host).gap;
    const next = segmentAt(event.clientX - box.left, days.length, box.width, gap);
    if (next === hovered) return;
    hovered = next;
    paint();
    placeTooltip();
  }

  function onPointerLeave(): void {
    if (hovered === null) return;
    hovered = null;
    paint();
    placeTooltip();
  }

  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", onPointerLeave);

  const observer = new ResizeObserver(([entry]) => {
    const next = entry?.contentRect.width ?? 0;
    if (next === width) return;
    width = next;
    paint();
    placeTooltip();
  });
  observer.observe(host);
  width = host.getBoundingClientRect().width;
  ratio = window.devicePixelRatio || 1;

  return {
    update(nextDays, nextRange) {
      days = nextDays;
      range = nextRange;
      hovered = null;
      host.setAttribute("aria-label", summarise(days));
      // What the drawing cannot say. Each day used to carry its own element
      // with its own label; a canvas carries none, so the maintenance windows
      // are named here instead.
      hiddenList.textContent = "";
      for (const day of days.filter((entry) => entry.maintenance.length > 0)) {
        const item = document.createElement("li");
        item.textContent = tooltipFor(day);
        hiddenList.append(item);
      }
      paint();
      placeTooltip();
    },
    destroy() {
      observer.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      tooltip.destroy();
    },
  };
}
