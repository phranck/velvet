/**
 * The response-time chart: the drawing that goes with the arithmetic beside it.
 *
 * `site/src/components/service/ResponseTimeChart.svelte` states `WIDTH`,
 * `HEIGHT`, the four plot edges, the point radius and the tooltip width as
 * module constants, so no design can reach them. Here they are a style object a
 * design passes, and the proportion of the plot becomes a design decision
 * rather than a constant.
 *
 * The curve itself is drawn by `monotonePath` from the arithmetic beside this,
 * which is the same function the product uses, so no design can show a smoother
 * or uglier line than the real page would.
 *
 * Version 2.
 */

import {
  availableResponseTimestamps,
  downsampleResponseSamples,
  filterResponseSeries,
  monotonePath,
  nearestResponseTimestamp,
  responseAxisStep,
  responseRangeWindow,
  responseScaleTicks,
  responseValuesAtTimestamp,
} from "./arithmetic.js";
import type { RangeKey, ResponseSeries } from "../data.js";
import { createOverlay } from "../overlay/index.js";
import { rangeLabel } from "../status.js";

/** The version a manifest names to use this plugin. */
export const VERSION = 2;

/** Everything the chart needs in order to lay itself out. */
export interface ResponseChartStyle {
  /** How tall the plot is, in the drawing units the viewBox uses. */
  height: number;
  /** The space kept clear at the left and right edges. */
  insetInline: number;
  /** The space kept clear at the top and bottom. */
  insetBlock: number;
  /** How many horizontal rules stand behind the curve. */
  gridLines: number;
  /** How thick the curve is drawn. */
  lineWidth: number;
  /** The radius of a plotted point. */
  pointRadius: number;
  /** How wide the hover reading is. */
  tooltipWidth: number;
  /** The opacity of the area under the curve; zero draws none. */
  fill: number;
  /**
   * How far a short tick reaches up from the time axis. Zero on both lengths
   * draws no scale at all.
   *
   * Only the two lengths are a design's. Where the ticks stand follows from
   * how long the window is, which `responseScaleTicks` decides.
   */
  tickMinor: number;
  /** How far a long tick reaches up from the time axis. */
  tickMajor: number;
}

/** What the chart draws where a design says nothing. */
export const DEFAULT_RESPONSE_CHART_STYLE: ResponseChartStyle = {
  height: 148,
  insetInline: 12,
  insetBlock: 12,
  gridLines: 3,
  lineWidth: 2,
  pointRadius: 3,
  tooltipWidth: 136,
  fill: 0,
  tickMinor: 0,
  tickMajor: 0,
};

/** What each of the two series is drawn in. */
export interface SeriesColours {
  ipv4: string;
  ipv6: string;
}

/** How a design configures one chart. */
export interface ResponseChartOptions {
  /**
   * The layout, or a function returning it.
   *
   * A function is re-read on every draw, which is what lets a design whose
   * values come from its own custom properties follow a change without being
   * told about it.
   */
  style?: Partial<ResponseChartStyle> | (() => Partial<ResponseChartStyle>);
  /** The class put on the hover reading, which lives on the document's layer. */
  tooltipClassName?: string;
  /**
   * Whether the pointer's reading is shown beside it at all.
   *
   * A design whose plot already names what the pointer stands on, or which
   * wants nothing floating over the page, turns it off. The strip the pointer
   * rides on and the drawing itself are unaffected.
   *
   * Absent reads as shown, which is what every design did before there was a
   * choice.
   */
  tooltip?: boolean;
  /**
   * What each series is drawn in, or a function returning it.
   *
   * Read once per render rather than once per pointer move. The hover reading
   * lives on the document rather than inside the service, so it inherits
   * nothing from it: a design that colours a series by service has to hand
   * those colours over. Left out where the design colours by protocol, and the
   * reading's own rule then stands.
   */
  seriesColours?: SeriesColours | (() => SeriesColours);
  /**
   * Where the reading under the crosshair goes, one string per line, or `null`
   * when the pointer has left.
   *
   * Given by a design that reads on a display of its own; where it is absent
   * the chart shows its own overlay above the plot instead.
   */
  report?: (lines: string[] | null) => void;
}

type Series = ResponseSeries;
type Sample = Series[number]["samples"][number];
type MeasuredSample = Sample & { responseTimeMs: number };

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The viewBox width every chart is drawn in.
 *
 * A constant on purpose. The chart scales to whatever width its container has,
 * so this is a drawing unit rather than a size, and a theme that changed it
 * would only change how coarse the arithmetic is. The height is a token,
 * because the ratio of the plot is a design decision.
 */
const VIEW_WIDTH = 640;

/** How many points survive downsampling, matching `MAX_POINTS` in the component. */
const MAX_POINTS = 96;

/*
 * Built once rather than per call. This labels the hover tooltip, which follows
 * the pointer, so a formatter constructed inside the function would be
 * constructed on every pointer move for as long as somebody keeps moving.
 */
const HOVER_TIME = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * A response time as a reader sees it.
 *
 * @param value - Milliseconds, or null where the measurement failed.
 * @returns The value with its unit, or the word for a failed measurement.
 */
function formatMilliseconds(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "unavailable"
    : `${Math.round(value)} ms`;
}

/** How a protocol is named in the legend and the readings. */
function protocolLabel(protocol: "ipv4" | "ipv6"): string {
  return protocol === "ipv4" ? "IPv4" : "IPv6";
}

/**
 * Splits samples into runs of consecutive measurements.
 *
 * A failed measurement ends a run rather than being interpolated over, so the
 * line breaks where nothing was recorded. Drawing across the gap would claim a
 * response time that was never observed.
 *
 * @param samples - The series to split.
 * @returns One array per unbroken run.
 */
function measuredRuns(samples: Sample[]): MeasuredSample[][] {
  const runs: MeasuredSample[][] = [];
  let current: MeasuredSample[] = [];
  for (const sample of samples) {
    if (sample.responseTimeMs === null) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else {
      current.push(sample as MeasuredSample);
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/** Creates an SVG element with attributes, since there is a lot of this below. */
function svg<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

/** What a caller gets back, so it can hand the chart a new range. */
export interface ChartView {
  update(series: Series, range: RangeKey): void;
  /**
   * Removes the chart's listeners and the reading it put on the document.
   *
   * The reading lives on the document's own layer rather than inside the chart,
   * so tearing the chart out of the page would otherwise leave it behind.
   */
  destroy(): void;
}

/**
 * Builds a chart inside the given host element.
 *
 * @param host - The element the chart is drawn into. It is emptied first.
 * @param serviceId - Used to make the gradient and label identifiers unique,
 *   since several charts share one document.
 * @param serviceName - Named in the accessible description.
 * @param generatedAt - The moment the data was generated, which is the right
 *   edge of every range window.
 * @param options - The layout, the series colours, the reporter, and the class
 *   the hover reading carries.
 * @returns A handle for updating the chart.
 */
export function createChartView(
  host: HTMLElement,
  serviceId: string,
  serviceName: string,
  generatedAt: string,
  monitoringStartedAt: string,
  options: ResponseChartOptions = {},
): ChartView {
  const report = options.report;

  /** The layout as it stands now, which a function-valued option can change. */
  function currentStyle(): ResponseChartStyle {
    const given =
      typeof options.style === "function" ? options.style() : options.style;
    return { ...DEFAULT_RESPONSE_CHART_STYLE, ...given };
  }

  /** The series colours as they stand now, on the same terms as the layout. */
  function currentSeriesColours(): SeriesColours {
    const given =
      typeof options.seriesColours === "function"
        ? options.seriesColours()
        : options.seriesColours;
    return given ?? { ipv4: "", ipv6: "" };
  }

  host.textContent = "";
  host.classList.add("response-chart");

  const caption = document.createElement("p");
  caption.className = "chart-caption";
  caption.textContent = "Response time";
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.setAttribute("role", "list");
  legend.setAttribute("aria-label", "Response time series");
  const plotHost = document.createElement("div");
  plotHost.className = "chart-plot";
  plotHost.setAttribute("tabindex", "0");
  plotHost.setAttribute("role", "img");
  /*
    The two ends of the range, under the drawing rather than inside it.

    A design may give the plot a surface of its own, and a label drawn inside
    the drawing stands on that surface rather than under it. Out here it sits
    on whatever the card is made of, which is where a scale of this kind is
    read from.
  */
  const axisRow = document.createElement("div");
  axisRow.className = "chart-axis-row";
  axisRow.setAttribute("aria-hidden", "true");
  const axisFrom = document.createElement("span");
  const axisTo = document.createElement("span");
  axisTo.textContent = "Now";
  axisRow.append(axisFrom, axisTo);
  host.append(caption, legend, plotHost, axisRow);

  let series: Series = [];
  let range: RangeKey = "month";
  let activeTimestamp: string | null = null;
  /*
    What the drawing is made of, derived once per change of series or range
    rather than once per pointer move.

    All three follow from `series`, `range` and `generatedAt`, and none of those
    changes whilst somebody moves the pointer across the plot. Derived in the
    handler instead, the filter ran over the whole series and the timestamp list
    was rebuilt on every event, which came to 0.314ms spent before it was even
    known whether the crosshair had moved.
  */
  let filtered: Series = [];
  let timestamps: string[] = [];
  let rangeWindow = responseRangeWindow(range, generatedAt, monitoringStartedAt);
  /*
    The frame a render is waiting on, or 0 whilst none is.

    A pointer delivers several moves per frame and only the last of them is ever
    seen, so a render is booked for the next frame and further moves in the same
    one join it. Without this each event drew the whole chart again and the
    crosshair fell behind the pointer by however many events the frame carried.
  */
  let frame = 0;
  /*
    What each series is drawn in, read once per render rather than per pointer
    move. The overlay lives on the document rather than inside the service, so
    it inherits nothing from it: a design that colours a series by service has
    to hand those colours over. Empty where the design colours by protocol, and
    then the overlay's own rule stands.
  */
  let seriesColours = { ipv4: "", ipv6: "" };
  /**
   * Where the pointer may stand, and what it takes to put it there.
   *
   * Held from one drawing to the next, so moving the pointer costs three small
   * elements rather than the whole chart. Null whilst nothing is drawn, which
   * is a range with no samples in it.
   */
  let geometry: {
    hover: SVGGElement;
    xFor: (timestamp: string) => number;
    yFor: (value: number) => number;
    height: number;
    pointRadius: number;
  } | null = null;
  // On the document's own layer, for the reasons the overlay plugin records.
  const tooltip =
    options.tooltip === false
      ? null
      : createOverlay(options.tooltipClassName ?? "chart-reading");

  /**
   * The box the drawing itself occupies.
   *
   * The drawing rather than its container, because a design may hold the plot
   * inside a frame with room around it, and every coordinate below is in the
   * drawing's own units: measuring the container would carry that room into
   * the scale and put the crosshair beside the pointer.
   *
   * @returns The drawing's box, or the container's whilst nothing is drawn.
   */
  function plotBox(): DOMRect {
    const drawing = plotHost.querySelector("svg");
    return (drawing ?? plotHost).getBoundingClientRect();
  }

  /**
   * Works out everything that follows from the series and the range.
   *
   * Called where those two change, which is the only place they can, so the
   * pointer handlers read these rather than deriving them per event.
   */
  function deriveState(): void {
    filtered = filterResponseSeries(
      series,
      range,
      generatedAt,
      monitoringStartedAt,
    );
    timestamps = availableResponseTimestamps(filtered);
    rangeWindow = responseRangeWindow(range, generatedAt, monitoringStartedAt);
  }

  /**
   * Books the pointer for the next frame, or joins the booking already made.
   *
   * Everything that follows the pointer goes through this, and it moves the
   * pointer alone. A change of state the reader asked for directly, such as a
   * new range, draws the whole chart at once instead, because that is not a
   * frame's worth of pointer movement.
   */
  function schedulePointer(): void {
    if (frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      placeHover();
    });
  }

  /** Draws the whole chart now, dropping any frame that was waiting. */
  function redrawNow(): void {
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    render();
  }

  /**
   * Shows the reading under the crosshair.
   *
   * @param plotX - Where the crosshair is, in the drawing's own units.
   * @param timestamp - The measurement being read.
   * @param values - One entry per protocol that answered at that moment.
   */
  function showReading(
    plotX: number,
    timestamp: string,
    values: Array<{ protocol: "ipv4" | "ipv6"; responseTimeMs: number }>,
  ): void {
    // A design may read this on a display of its own, and then it is told the
    // same two lines rather than having them drawn over the plot.
    if (report) {
      report([
        HOVER_TIME.format(new Date(timestamp)),
        values
          .map(
            (value) =>
              `${protocolLabel(value.protocol)} ${formatMilliseconds(value.responseTimeMs)}`,
          )
          .join("   "),
      ]);
      return;
    }
    const body = document.createElement("span");
    body.className = "chart-reading-body";
    const when = document.createElement("span");
    when.className = "chart-reading-time";
    when.textContent = HOVER_TIME.format(new Date(timestamp));
    body.append(when);
    for (const value of values) {
      const row = document.createElement("span");
      row.className = "chart-reading-row";
      row.dataset.protocol = value.protocol;
      const colour = seriesColours[value.protocol];
      if (colour) row.style.setProperty("--series-colour", colour);
      const key = document.createElement("span");
      key.className = "chart-reading-key";
      const label = document.createElement("span");
      label.textContent = protocolLabel(value.protocol);
      const reading = document.createElement("strong");
      reading.textContent = formatMilliseconds(value.responseTimeMs);
      row.append(key, label, reading);
      body.append(row);
    }
    tooltip?.show(body, () => {
      if (activeTimestamp !== timestamp) return null;
      const box = plotBox();
      if (box.width === 0) return null;
      // The drawing scales to its container, so a coordinate inside the
      // viewBox has to be carried back into viewport units before the overlay
      // can be put anywhere.
      const scale = box.width / VIEW_WIDTH;
      return {
        rect: new DOMRect(box.left + plotX * scale, box.top, 1, box.height),
        side: "above",
      };
    });
  }

  /** Draws everything from the current state. */
  function render(): void {
    const tokens = currentStyle();
    seriesColours = currentSeriesColours();
    const withSamples = filtered.filter(({ samples }) => samples.length > 0);

    legend.textContent = "";
    for (const entry of withSamples) {
      const item = document.createElement("span");
      item.className = "chart-legend-item";
      item.setAttribute("role", "listitem");
      item.dataset.protocol = entry.protocol;
      const key = document.createElement("span");
      key.className = "chart-line-key";
      key.setAttribute("aria-hidden", "true");
      const name = document.createElement("span");
      name.textContent = protocolLabel(entry.protocol);
      const value = document.createElement("strong");
      value.textContent = formatMilliseconds(
        entry.samples.at(-1)?.responseTimeMs,
      );
      item.append(key, name, value);
      legend.append(item);
    }

    plotHost.textContent = "";
    if (withSamples.length === 0) {
      const empty = document.createElement("p");
      empty.className = "chart-empty";
      empty.setAttribute("role", "status");
      empty.textContent = "No response history for this range.";
      plotHost.append(empty);
      plotHost.removeAttribute("tabindex");
      // Nothing drawn, so the pointer has nowhere to stand and nothing may be
      // left hanging over the page.
      geometry = null;
      tooltip?.hide();
      return;
    }
    plotHost.setAttribute("tabindex", "0");

    const plotTop = tokens.insetBlock;
    /*
      The bottom of the plot leaves room beneath it for the two axis labels,
      which sit inside the drawing so they scale with it. How much room is the
      theme's, because a design may want them tucked under the plot or well
      clear of it.

      Below their baseline sits only enough for their descenders. Taking the
      inset off both ends instead left that much empty drawing under the words,
      which the panel's own padding then added to.
    */
    /*
      The time axis is the foot of the drawing. Everything a design prints
      below the readings stands on it rather than under it: the printed scale
      grows up from it into the plot, and the two range labels are read
      outside the drawing altogether.
    */
    const plotBottom = tokens.height;
    const plotLeft = tokens.insetInline;
    const plotRight = VIEW_WIDTH - tokens.insetInline;

    let highest = 1;
    for (const entry of filtered) {
      for (const sample of entry.samples) {
        if (sample.responseTimeMs !== null && sample.responseTimeMs > highest) {
          highest = sample.responseTimeMs;
        }
      }
    }

    /*
      The axis climbs in a round figure, and its top is that figure times the
      number of steps rather than the highest reading itself. How many steps
      there are is the design's, because that is how dense a grid it wants;
      what each one is worth is the arithmetic's, because a figure beside a
      grid line is read against the next service along.
    */
    const steps = Math.max(1, tokens.gridLines - 1);
    const step = responseAxisStep(highest, steps);
    const maximum = step * steps;

    const xForTime = (time: number): number =>
      plotLeft +
      ((time - rangeWindow.start) / (rangeWindow.end - rangeWindow.start)) *
        (plotRight - plotLeft);
    const xFor = (timestamp: string): number => xForTime(Date.parse(timestamp));
    const yFor = (value: number): number =>
      plotBottom - (value / maximum) * (plotBottom - plotTop);

    /*
      The drawing carries no name of its own, and no `title`.

      Its host is the graphic: `plotHost` takes `role="img"` and an `aria-label`
      naming the service and reading out every series, which is more than a
      title could say. A second name inside it made one graphic announce itself
      twice, and an SVG `title` is also what a browser shows as a tooltip, so
      Safari put one over the plot for as long as the pointer was on it.
    */
    const root = svg("svg", {
      class: "chart-svg",
      viewBox: `0 0 ${VIEW_WIDTH} ${tokens.height}`,
      "aria-hidden": "true",
    });

    if (tokens.fill > 0) {
      const defs = svg("defs");
      for (const protocol of ["ipv4", "ipv6"] as const) {
        const gradient = svg("linearGradient", {
          id: `chart-${serviceId}-${protocol}`,
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 1,
        });
        gradient.dataset.protocol = protocol;
        gradient.append(
          svg("stop", { offset: 0, "stop-opacity": tokens.fill }),
          svg("stop", { offset: 1, "stop-opacity": 0 }),
        );
        defs.append(gradient);
      }
      root.append(defs);
    }

    // The grid is drawn from the token rather than as three fixed lines, so a
    // wireframe theme can ask for five and a print theme for none.
    const grid = svg("g", { class: "chart-grid", "aria-hidden": "true" });
    for (let index = 0; index < tokens.gridLines; index += 1) {
      const y =
        tokens.gridLines === 1
          ? (plotTop + plotBottom) / 2
          : plotTop + (index * (plotBottom - plotTop)) / (tokens.gridLines - 1);
      grid.append(svg("line", { x1: plotLeft, y1: y, x2: plotRight, y2: y }));
    }
    root.append(grid);

    /*
      The value each grid line stands for, written just above it and inside the
      plot, so the scale costs no width. The lowest line is zero and says so by
      being the floor, which is why it carries no label of its own.
    */
    const scale = svg("g", { class: "chart-scale", "aria-hidden": "true" });
    for (let index = 0; index < tokens.gridLines - 1; index += 1) {
      const y =
        plotTop + (index * (plotBottom - plotTop)) / (tokens.gridLines - 1);
      const value = maximum * (1 - index / (tokens.gridLines - 1));
      const label = svg("text", { x: plotLeft + 4, y: y - 4 });
      label.textContent = `${Math.round(value)} ms`;
      scale.append(label);
    }
    root.append(scale);

    for (const entry of withSamples) {
      const reduced = downsampleResponseSamples(entry.samples, MAX_POINTS);
      for (const run of measuredRuns(reduced)) {
        const points = run.map((sample) => ({
          x: xFor(sample.timestamp),
          y: yFor(sample.responseTimeMs),
        }));
        if (points.length === 1) {
          const point = svg("circle", {
            class: "chart-point",
            cx: points[0]!.x,
            cy: points[0]!.y,
            r: tokens.pointRadius,
          });
          point.dataset.protocol = entry.protocol;
          root.append(point);
          continue;
        }
        const path = monotonePath(points);
        if (tokens.fill > 0) {
          const area = svg("path", {
            class: "chart-area",
            d: `${path} L${points.at(-1)!.x.toFixed(2)} ${plotBottom} L${points[0]!.x.toFixed(2)} ${plotBottom} Z`,
            fill: `url(#chart-${serviceId}-${entry.protocol})`,
          });
          area.dataset.protocol = entry.protocol;
          root.append(area);
        }
        const line = svg("path", {
          class: "chart-line",
          d: path,
          "stroke-width": tokens.lineWidth,
        });
        line.dataset.protocol = entry.protocol;
        root.append(line);
      }
    }

    /*
      The printed scale.

      Drawn here rather than as a background on the plot, because it belongs
      between the readings and the two labels under them and both of those are
      in the drawing's own units: a scale positioned in pixels would drift away
      from them as the chart scales. A design that prints none sets its tick
      heights to zero and this draws nothing.

      It stands above the readings and below the pointer, which is the order a
      scale printed on the glass of a dial is read in: the trace runs behind
      the marks, and whatever the reader slides across them runs in front.
    */
    if (tokens.tickMajor > 0 || tokens.tickMinor > 0) {
      const ticks = svg("g", { class: "chart-ticks", "aria-hidden": "true" });
      for (const tick of responseScaleTicks(rangeWindow)) {
        const x = xForTime(tick.at);
        // Every tick stands on the time axis and reaches up by its own
        // length, which is how a printed scale is set: the foot is the
        // measure and the head says how important the mark is.
        ticks.append(
          svg("line", {
            class: tick.major ? "chart-tick chart-tick--major" : "chart-tick",
            x1: x,
            y1: plotBottom - (tick.major ? tokens.tickMajor : tokens.tickMinor),
            x2: x,
            y2: plotBottom,
          }),
        );
      }
      root.append(ticks);
    }

    const axes = svg("g", { class: "chart-axis", "aria-hidden": "true" });
    // The two sides of the plot, drawn as lines rather than left to the grid.
    // A design may want them stronger than the grid, and they are what the
    // readings are measured against.
    axes.append(
      svg("line", {
        class: "chart-axis-line chart-axis-line--value",
        x1: plotLeft,
        y1: plotTop,
        x2: plotLeft,
        y2: plotBottom,
      }),
      svg("line", {
        class: "chart-axis-line chart-axis-line--time",
        x1: plotLeft,
        y1: plotBottom,
        x2: plotRight,
        y2: plotBottom,
      }),
    );
    root.append(axes);

    /*
      The pointer, last of everything drawn inside the plot.

      A receiver of this period is read through a strip of plexiglass laid over
      the printed scale, so the strip and its hairline stand in front of the
      marks and the trace alike. Drawn after both for exactly that reason: an
      SVG paints in document order, and a pointer behind the scale it points at
      is not a pointer.
    */
    const hover = svg("g", { class: "chart-hover", "aria-hidden": "true" });
    root.append(hover);
    // What the pointer needs in order to stand somewhere, kept so that moving
    // it does not mean working all of this out again.
    geometry = {
      hover,
      xFor,
      yFor,
      height: tokens.height,
      pointRadius: tokens.pointRadius,
    };

    axisFrom.textContent = rangeLabel(range, monitoringStartedAt);

    const description = withSamples
      .map((entry) => {
        const measured = entry.samples.filter(
          (sample) => sample.responseTimeMs !== null,
        ) as MeasuredSample[];
        const times = measured.map((sample) => sample.responseTimeMs);
        const missing = entry.samples.length - measured.length;
        return `${protocolLabel(entry.protocol)}: current ${formatMilliseconds(entry.samples.at(-1)?.responseTimeMs)}, minimum ${formatMilliseconds(Math.min(...times))}, maximum ${formatMilliseconds(Math.max(...times))}, ${missing === 0 ? "no unavailable samples" : `${missing} unavailable ${missing === 1 ? "sample" : "samples"}`}.`;
      })
      .join(" ");
    plotHost.setAttribute(
      "aria-label",
      `Response time chart for ${serviceName}. ${description} Unavailable samples create gaps in the chart.`,
    );
    plotHost.append(root);

    // The pointer goes on last, now that the drawing is back in the document:
    // the overlay measures the plot in order to place the reading, and an
    // element that has just been emptied measures as nothing.
    placeHover();
  }

  /**
   * Puts the pointer where the active measurement is, and touches nothing else.
   *
   * This is the whole of what a pointer move changes. Everything around it
   * follows from the series and the range, so a move rebuilds three small
   * elements rather than the drawing: measured before this was split out, one
   * move cost 0.737ms of legend, defs, grid, scale, downsampling over roughly
   * 1200 samples, ticks, axes and an accessible description, all to stand a
   * needle a few pixels further along.
   */
  function placeHover(): void {
    if (!geometry) return;
    geometry.hover.textContent = "";
    const values = activeTimestamp
      ? responseValuesAtTimestamp(filtered, activeTimestamp)
      : [];
    if (!activeTimestamp || values.length === 0) {
      tooltip?.hide();
      report?.(null);
      return;
    }
    const x = geometry.xFor(activeTimestamp);
    /*
      The strip the pointer rides on, sized and coloured entirely in the
      stylesheet: its width is a design decision and its position is not, so
      the drawing states where it stands and the theme states how wide it is.
      It is centred on that position by a transform against its own box, since
      only the theme knows the width to halve.
    */
    geometry.hover.append(
      svg("rect", { class: "chart-needle", x, y: 0, height: geometry.height }),
      svg("line", {
        class: "chart-crosshair",
        x1: x,
        y1: 0,
        x2: x,
        y2: geometry.height,
      }),
    );
    for (const value of values) {
      const dot = svg("circle", {
        class: "chart-hover-point",
        cx: x,
        cy: geometry.yFor(value.responseTimeMs),
        r: geometry.pointRadius + 1,
      });
      dot.dataset.protocol = value.protocol;
      geometry.hover.append(dot);
    }
    // The reading itself goes on the document's own layer rather than into this
    // drawing, whose wrapper carries `overflow: hidden` for the disclosure
    // animation and whose card carries a `clip-path` in two themes.
    showReading(x, activeTimestamp, values);
  }

  /** Moves the crosshair to whichever measurement is nearest the pointer. */
  function onPointerMove(event: PointerEvent): void {
    const box = plotBox();
    if (box.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const next = nearestResponseTimestamp(
      timestamps,
      rangeWindow.start + ratio * (rangeWindow.end - rangeWindow.start),
    );
    if (next === activeTimestamp) return;
    activeTimestamp = next;
    schedulePointer();
  }

  function clearHover(): void {
    if (activeTimestamp === null) return;
    activeTimestamp = null;
    schedulePointer();
  }

  /** Arrow keys step between measurements, so the chart is reachable without a pointer. */
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    if (timestamps.length === 0) return;
    const current = activeTimestamp
      ? timestamps.indexOf(activeTimestamp)
      : timestamps.length - 1;
    const next = Math.min(
      timestamps.length - 1,
      Math.max(0, current + (event.key === "ArrowLeft" ? -1 : 1)),
    );
    activeTimestamp = timestamps[next] ?? null;
    schedulePointer();
  }

  function onFocus(): void {
    activeTimestamp = timestamps.at(-1) ?? null;
    schedulePointer();
  }

  plotHost.addEventListener("pointermove", onPointerMove);
  plotHost.addEventListener("pointerleave", clearHover);
  plotHost.addEventListener("blur", clearHover);
  plotHost.addEventListener("keydown", onKeyDown);
  plotHost.addEventListener("focus", onFocus);

  return {
    update(nextSeries, nextRange) {
      series = nextSeries;
      range = nextRange;
      activeTimestamp = null;
      deriveState();
      redrawNow();
    },
    destroy() {
      // Before the listeners go, so a render booked by the last event cannot
      // run against a plot that has been emptied.
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      plotHost.removeEventListener("pointermove", onPointerMove);
      plotHost.removeEventListener("pointerleave", clearHover);
      plotHost.removeEventListener("blur", clearHover);
      plotHost.removeEventListener("keydown", onKeyDown);
      plotHost.removeEventListener("focus", onFocus);
      tooltip?.destroy();
      host.textContent = "";
    },
  };
}
