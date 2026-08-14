/**
 * The availability strip, drawn on a canvas.
 *
 * The canvas is not a stylistic choice and is kept deliberately. A quarter of a
 * year is 90 segments for each service, and 90 rounded boxes are re-rasterised
 * by everything that repaints the page. The measurement recorded in
 * `site/src/components/UptimeBar.svelte` is 695ms of rasterisation as elements
 * against 315ms as a canvas, over six expand-all cycles at 90 days with four
 * services.
 *
 * It also carries the rule that decides a day's colour, which is the one place
 * where a plausible-looking mistake shows a green day where nothing was
 * measured. That rule is why this is shared rather than left for
 * every design to write again.
 *
 * What it does **not** carry is an appearance. Where this drawing used to read
 * a shared token set out of the stylesheet, it now takes a style object from
 * the design that uses it, so two designs using this strip need not look
 * alike. Everything with a default below is what the product draws today.
 */

import type { DayStatus, RangeKey } from "../data.js";
import { createOverlay } from "../overlay/index.js";


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
 * Everything the strip needs in order to draw itself.
 *
 * A design states as much or as little of this as it cares about; the rest is
 * what the product draws today. Nothing here is read from the document, so a
 * design that wants its values to come from its own custom properties resolves
 * them itself and passes a function.
 */
export interface UptimeStripStyle {
  /** How tall a segment stands. */
  height: number;
  /** How tall the segment under the pointer stands. */
  hoverHeight: number;
  /** The gap between segments. */
  gap: number;
  /** The corner radius of a segment. */
  radius: number;
  /** The radius used at 90 days, where segments are about a quarter as wide. */
  narrowRadius: number;
  /** Whether a segment carries the light-catching gradient. */
  gloss: boolean;
  /**
   * Which way that gradient reads: a segment standing out of the track, or one
   * sunk into it.
   *
   * `raised` lights the top edge and shades the foot, which is a bar sitting on
   * a surface. `sunken` does the opposite, so the same bar reads as a window cut
   * into the plate with the light falling in from above. A design emulating a
   * machine wants the second one wherever its other parts are recessed.
   *
   * Absent reads as `raised`, which is what every design drew before there was
   * a choice.
   */
  relief?: "raised" | "sunken";
  /**
   * What the segment under the pointer does.
   *
   * `grow` stands it up to `hoverHeight`, which is a bar rising out of the row.
   * `lighten` leaves every segment at its own height and brightens the one
   * under the pointer instead, which is what a lamp behind a plate does and the
   * only answer available to a design whose segments are sunk into one.
   *
   * A day nothing was measured on stays as it is either way: there is no lamp
   * behind it to turn up.
   *
   * Absent reads as `grow`.
   */
  hover?: "grow" | "lighten";
  /**
   * How much white goes into the hovered segment under `lighten`, from 0 to 1.
   *
   * Absent reads as 0.28, which is a step somebody notices without the colour
   * losing which state it stands for.
   */
  hoverLighten?: number;
  /**
   * How far apart the blocks of one segment are lit, from 0 to 1.
   *
   * Only read where `relief` is `sunken` and a segment is drawn as more than
   * one block. The blocks are flat, and this is the whole distance between the
   * darkest at the top and the lightest at the foot, spread evenly and centred
   * on the state's own colour.
   *
   * Absent reads as 0.16.
   */
  reliefSpread?: number;
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
  /** The inset edge a maintenance day carries. */
  maintenanceEdge: string;
  /** The inset edge a day with no measurement carries instead of a gloss. */
  ghostEdge: string;
}

/** What the strip draws where a design says nothing. */
export const DEFAULT_UPTIME_STRIP_STYLE: UptimeStripStyle = {
  height: 32,
  hoverHeight: 38,
  gap: 2,
  radius: 2,
  narrowRadius: 999,
  gloss: true,
  relief: "raised",
  align: "center",
  pieces: 1,
  pieceGap: 2,
  trackRadius: 0,
  operational: "#3fa06a",
  degraded: "#d1971f",
  outage: "#cf4a3a",
  noData: "#3a3a44",
  maintenance: "#4a7fd1",
  maintenanceEdge: "#89b3f0",
  ghostEdge: "#5a5a68",
};

/** How a design configures one strip. */
export interface UptimeStripOptions {
  /**
   * The appearance, or a function returning it.
   *
   * A function is re-read on every paint, which is what lets a design whose
   * values come from its own custom properties follow a change without being
   * told about it.
   */
  style?: Partial<UptimeStripStyle> | (() => Partial<UptimeStripStyle>);
  /** The class put on the host element, so a design can address it. */
  className?: string;
  /** The class put on the tooltip, which lives on the document's own layer. */
  tooltipClassName?: string;
  /**
   * The property the measured surface height is written to on the host.
   *
   * The canvas is taller than a segment, because a lifted segment stands past
   * it and a canvas clips at its own edge. A design that reserves space for the
   * strip in its layout needs to know the figure.
   */
  heightProperty?: string;
  /**
   * Where the reading for the hovered day goes, one string per line, or `null`
   * when nothing is hovered.
   *
   * Given by a design that reads on a display of its own; where it is absent
   * the strip shows its own overlay over the segment instead.
   */
  report?: (lines: string[] | null) => void;
}

/**
 * Which state colour a day is painted in.
 *
 * The order matters. **A day nothing was measured on takes the no-data colour
 * whatever its recorded status says**, because such a day can still be recorded
 * as operational and reading the status first would paint an empty day as a
 * working one.
 */
function statusColour(day: DayStatus, style: UptimeStripStyle): string {
  if (day.maintenance.length > 0 && day.status === "operational") {
    return style.maintenance;
  }
  if (!day.hasData && day.maintenance.length === 0) return style.noData;
  if (day.status === "operational") return style.operational;
  if (day.status === "unknown") return style.noData;
  if (day.status === "degraded") return style.degraded;
  return style.outage;
}

/** What a day says about itself, in words. */
function label(day: DayStatus): string {
  if (!day.hasData) return "no data";
  if (day.status === "operational") return "operational";
  if (day.status === "unknown") return "status unknown";
  if (day.status === "degraded") return `degraded · ${day.minutesDown} min down`;
  return `outage · ${day.minutesDown} min`;
}

/** Every maintenance window covering a day, named with its span. */
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
 * A bucket covering more than one day names its span rather than a single date,
 * which is the case the year range produces.
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

/**
 * Where a segment sits along the strip, in CSS pixels.
 *
 * The gap gives way before the segment does. At ninety segments on a phone the
 * gaps alone are wider than the strip, which left every segment a negative
 * width; the canvas then refused to draw the first of them and the exception
 * took the whole script down with it, so nothing on the page answered any more.
 * Here the gap keeps only what is left once every segment has a pixel.
 */
function slot(index: number, total: number, width: number, gap: number) {
  const spare = Math.max(0, width - total);
  const fitted = total > 1 ? Math.min(gap, spare / (total - 1)) : 0;
  const each = (width - fitted * (total - 1)) / total;
  return { x: index * (each + fitted), width: each };
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
 * width, the device pixel ratio, the hovered segment, or the style changes.
 *
 * @param host - The element the strip is drawn into. It is emptied first.
 * @param options - The appearance, the names and the reporter the design wants
 *   used.
 * @returns Handles for updating and tearing the strip down.
 */
export function createUptimeStrip(
  host: HTMLElement,
  options: UptimeStripOptions = {},
): UptimeStrip {
  const className = options.className ?? "uptime-strip";
  const heightProperty = options.heightProperty ?? "--uptime-strip-height";
  const report = options.report;

  /** The style as it stands now, which a function-valued option can change. */
  function currentStyle(): UptimeStripStyle {
    const given =
      typeof options.style === "function" ? options.style() : options.style;
    return { ...DEFAULT_UPTIME_STRIP_STYLE, ...given };
  }

  host.textContent = "";
  host.classList.add(className);
  host.setAttribute("role", "img");

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  // On the document's own layer rather than inside the strip, so no card can
  // clip it. See the overlay for the measurements that forced this.
  const tooltip = createOverlay(options.tooltipClassName ?? "uptime-tooltip");
  const hiddenList = document.createElement("ul");
  hiddenList.className = `${className}-readings`;
  // Present to a screen reader and to nothing else, without depending on a
  // class the design may not have declared.
  hiddenList.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap";
  host.append(canvas, hiddenList);

  let days: DayStatus[] = [];
  let hovered: number | null = null;
  let width = 0;
  let ratio = 1;
  /*
    The frame a redraw is waiting on, or 0 whilst none is.

    A pointer delivers several moves per frame and only the last of them is ever
    seen, so a redraw is booked for the next frame and further moves in the same
    one join it. Without this the canvas was repainted once per event and the
    lit day fell behind the pointer by however many events the frame carried.
  */
  let frame = 0;

  /** Draws the whole strip once. */
  function paint(): void {
    const context = canvas.getContext("2d");
    if (!context || width <= 0) return;

    const style = currentStyle();
    // Taller than the strip, because the segment under the pointer stands past
    // it and a canvas clips at its own edge. A pixel either side keeps the
    // softened edge of a raised segment from being cut by the boundary.
    const surfaceHeight = style.hoverHeight + 2;
    host.style.setProperty(heightProperty, `${surfaceHeight}px`);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(surfaceHeight * ratio);
    canvas.style.width = "100%";
    canvas.style.height = `${surfaceHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, surfaceHeight);

    // A narrow segment takes the narrow radius, decided by how wide the segment
    // actually came out rather than by which range asked for it. `all` is any
    // number of segments, from one on an installation's first day to ninety on
    // an old one, so no range name predicts this.
    const segment = slot(0, days.length, width, style.gap).width;
    const radius = segment < style.radius * 4 ? style.narrowRadius : style.radius;
    // The light a raised segment catches, across its own height. A sunken one
    // is shaded by the ramp below instead.
    const gloss = context.createLinearGradient(
      0,
      (surfaceHeight - style.height) / 2,
      0,
      (surfaceHeight + style.height) / 2,
    );
    gloss.addColorStop(0, "rgba(255, 255, 255, 0.22)");
    gloss.addColorStop(0.42, "rgba(255, 255, 255, 0.05)");
    gloss.addColorStop(1, "rgba(0, 0, 0, 0.12)");

    const pieces = Math.max(1, Math.min(8, Math.round(style.pieces)));

    days.forEach((day, index) => {
      const place = slot(index, days.length, width, style.gap);
      const lifted = index === hovered;
      const lightens = style.hover === "lighten";
      const drawnHeight =
        lifted && !lightens ? style.hoverHeight : style.height;
      // Where the segment sits in the track. Centred keeps the strip
      // symmetrical and lets a segment under the pointer grow both ways;
      // anchored to an edge it grows only away from that edge, which is what a
      // bar-graph meter does and reads as a reading rather than as a history.
      const y =
        style.align === "bottom"
          ? surfaceHeight - drawnHeight - 1
          : style.align === "top"
            ? 1
            : (surfaceHeight - drawnHeight) / 2;
      // A day nothing was measured on carries an edge instead of the gloss:
      // nothing was recorded, so there is no surface to catch light.
      const empty = !day.hasData && day.maintenance.length === 0;
      const base = statusColour(day, style);
      // Mixed rather than replaced, so a lit segment is the same state a shade
      // brighter and no design has to name a second colour per state.
      const colour =
        lifted && lightens && !empty
          ? `color-mix(in srgb, #ffffff ${Math.round(
              (style.hoverLighten ?? 0.28) * 100,
            )}%, ${base})`
          : base;
      const edge = empty
        ? style.ghostEdge
        : day.maintenance.length > 0
          ? style.maintenanceEdge
          : null;

      // One segment may be drawn as a stack of shorter pieces, which turns a
      // solid bar into a column of blocks without changing what it says.
      const pieceHeight =
        (drawnHeight - style.pieceGap * (pieces - 1)) / pieces;
      if (pieceHeight <= 0) return;
      const fitted = Math.min(radius, place.width / 2, pieceHeight / 2);
      // The track's own ends. Only the outer corners of the first and last
      // segment take it, so a row of segments reads as one divided bar rather
      // than as a row of separate objects.
      const cap = Math.min(style.trackRadius, place.width, pieceHeight / 2);
      const first = index === 0 ? cap : fitted;
      const last = index === days.length - 1 ? cap : fitted;

      /*
        A stack lit from above.

        Each block is one flat colour, because a block is a lamp behind a window
        rather than a curved surface, and a gradient inside it would be a
        highlight nothing casts. What changes is the block: the one at the top
        stands deepest in the shadow of the plate and each one below it catches
        a little more of the light. The steps are symmetrical about the state's
        own colour, so a column of them still reads as that colour.
      */
      const ramp = (piece: number): string => {
        if (style.relief !== "sunken" || pieces < 2) return colour;
        const spread = style.reliefSpread ?? 0.16;
        const step = (piece / (pieces - 1) - 0.5) * spread * 100;
        const towards = step >= 0 ? "#ffffff" : "#000000";
        return `color-mix(in srgb, ${towards} ${Math.abs(step).toFixed(1)}%, ${colour})`;
      };

      // The recess each block sits in, in the block's own coordinates so every
      // one of them is lit alike. Built once per segment and moved to each
      // block, rather than one per block.
      const recess =
        style.relief === "sunken"
          ? context.createLinearGradient(0, 0, 0, pieceHeight)
          : null;
      if (recess) {
        // A hole punched through a plate: the wall the light misses runs a
        // third of the way down, the one it lands on is a narrow band at the
        // foot, and the floor between them is flat.
        recess.addColorStop(0, "rgba(0, 0, 0, 0.64)");
        recess.addColorStop(0.36, "rgba(0, 0, 0, 0.12)");
        recess.addColorStop(0.84, "rgba(0, 0, 0, 0)");
        recess.addColorStop(1, "rgba(255, 255, 255, 0.2)");
      }

      for (let piece = 0; piece < pieces; piece += 1) {
        const pieceY = y + piece * (pieceHeight + style.pieceGap);
        if (recess) context.save();
        if (recess) context.translate(0, pieceY);
        const top = recess ? 0 : pieceY;
        context.beginPath();
        context.roundRect(place.x, top, place.width, pieceHeight, [
          first,
          last,
          last,
          first,
        ]);
        context.fillStyle = ramp(piece);
        context.fill();
        if (!empty && style.gloss) {
          context.fillStyle = recess ?? gloss;
          context.fill();
        }
        if (!edge) {
          if (recess) context.restore();
          continue;
        }
        context.beginPath();
        context.roundRect(
          place.x + 0.5,
          top + 0.5,
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
        if (recess) context.restore();
      }
    });
  }

  /**
   * Shows the tooltip over the hovered segment, or hides it.
   *
   * The anchor is a function rather than a value, because the overlay re-reads
   * it whenever the page scrolls: the segment moves and nothing else would tell
   * the overlay to follow.
   */
  function placeTooltip(): void {
    if (hovered === null || !days[hovered]) {
      tooltip.hide();
      report?.(null);
      return;
    }
    const index = hovered;
    // A design may read this on a display of its own rather than over the
    // strip, and then it is told the same lines instead of being drawn on top
    // of the page.
    if (report) {
      report(tooltipFor(days[index]!).split("\n"));
      return;
    }
    tooltip.show(tooltipFor(days[index]!), () => {
      if (hovered !== index) return null;
      const box = host.getBoundingClientRect();
      const place = slot(index, days.length, box.width, currentStyle().gap);
      return {
        rect: new DOMRect(box.left + place.x, box.top, place.width, box.height),
        side: "above",
      };
    });
  }

  /**
   * Books a redraw for the next frame, or joins the one already booked.
   *
   * Everything that follows the pointer goes through this. A change the reader
   * asked for directly, such as a new range, redraws at once instead, because
   * that is not a frame's worth of pointer movement.
   */
  function scheduleDraw(): void {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      paint();
      placeTooltip();
    });
  }

  /** Redraws now, dropping any frame that was waiting to do the same. */
  function drawNow(): void {
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    paint();
    placeTooltip();
  }

  function onPointerMove(event: PointerEvent): void {
    const box = host.getBoundingClientRect();
    const next = segmentAt(
      event.clientX - box.left,
      days.length,
      box.width,
      currentStyle().gap,
    );
    if (next === hovered) return;
    hovered = next;
    scheduleDraw();
  }

  function onPointerLeave(): void {
    if (hovered === null) return;
    hovered = null;
    scheduleDraw();
  }

  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerleave", onPointerLeave);

  const observer = new ResizeObserver(([entry]) => {
    const next = entry?.contentRect.width ?? 0;
    if (next === width) return;
    width = next;
    drawNow();
  });
  observer.observe(host);
  width = host.getBoundingClientRect().width;
  ratio = window.devicePixelRatio || 1;

  return {
    update(nextDays) {
      days = nextDays;
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
      drawNow();
    },
    destroy() {
      // Before the listeners go, so a redraw booked by the last event cannot
      // run against a canvas nobody is showing any more.
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      tooltip.destroy();
    },
  };
}
