/**
 * The response-time chart, laid out from tokens rather than from constants.
 *
 * This mirrors `site/src/components/service/ResponseTimeChart.svelte` and
 * differs in one respect: that component states `WIDTH`, `HEIGHT`, the four
 * plot edges, the point radius and the tooltip width as module constants, so no
 * theme can reach them. Here they come from `read-tokens.ts`, which is the
 * second prerequisite in `documentation/theme-authoring.md`.
 *
 * The curve itself is drawn by `monotonePath` from `site/src/lib/response-chart.ts`,
 * the same function the product uses, so a mockup cannot show a smoother or
 * uglier line than the real page would.
 */

import {
  availableResponseTimestamps,
  downsampleResponseSamples,
  filterResponseSeries,
  monotonePath,
  nearestResponseTimestamp,
  responseRangeWindow,
  responseValuesAtTimestamp,
} from "../src/lib/response-chart.js";
import { RANGE_LABEL } from "../src/lib/data.js";
import type { RangeKey, ResponseTimesDocument } from "../src/lib/types.js";
import { createOverlay } from "./overlay.js";
import { readChartTokens } from "./read-tokens.js";

type Series = ResponseTimesDocument["series"];
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

/** What one grid line stands apart from the next by, in milliseconds. */
const AXIS_STEP = 20;

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
 * @param report - Where the reading under the crosshair goes, one string per
 *   line, or `null` when the pointer has left. Given by a design that reads on
 *   a display of its own; where it is absent the chart shows its own overlay
 *   above the plot instead.
 * @returns A handle for updating the chart.
 */
export function createChartView(
  host: HTMLElement,
  serviceId: string,
  serviceName: string,
  generatedAt: string,
  report?: (lines: string[] | null) => void,
): ChartView {
  host.textContent = "";
  host.className = "response-chart";

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
    What each series is drawn in, read once per render rather than per pointer
    move. The overlay lives on the document rather than inside the service, so
    it inherits nothing from it: a design that colours a series by service has
    to hand those colours over. Empty where the design colours by protocol, and
    then the overlay's own rule stands.
  */
  let seriesColours = { ipv4: "", ipv6: "" };
  /**
   * The reading to show once the drawing is back in the document.
   *
   * Collected whilst drawing and used at the end of it, because the overlay
   * measures the plot in order to place itself and the plot is empty for the
   * whole of a render.
   */
  let pendingReading: {
    plotX: number;
    timestamp: string;
    values: Array<{ protocol: "ipv4" | "ipv6"; responseTimeMs: number }>;
  } | null = null;
  // On the document's own layer, for the reasons in `overlay.ts`. It carries
  // the same class as the strip's, so a theme states that appearance once.
  const tooltip = createOverlay("uptime-tooltip chart-reading");

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
    tooltip.show(body, () => {
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
    const tokens = readChartTokens(host);
    const inherited = getComputedStyle(host);
    seriesColours = {
      ipv4: inherited.getPropertyValue("--series-own").trim(),
      ipv6: inherited.getPropertyValue("--series-next").trim(),
    };
    const filtered = filterResponseSeries(series, range, generatedAt);
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
      // Nothing to read, so nothing may be left hanging over the page.
      pendingReading = null;
      tooltip.hide();
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
      The axis is drawn in steps of twenty milliseconds, and its top is whatever
      number of those steps the readings need rather than the highest reading
      itself.

      Scaling to the highest reading made every service look alike: one running
      at 96ms and one at 412ms both filled the plot to the top, and the shape
      said nothing about how slow either was. With a fixed step the trace sits
      where the readings put it, and the labels are figures a reader can compare
      from one service to the next.

      The step grows in multiples of twenty where it has to, so a slow service
      does not end up with twenty-five lines across it.
    */
    const steps = Math.max(1, tokens.gridLines - 1);
    const step =
      AXIS_STEP * Math.max(1, Math.ceil(highest / (AXIS_STEP * steps)));
    const maximum = step * steps;

    const window = responseRangeWindow(range, generatedAt);
    const xFor = (timestamp: string): number =>
      plotLeft +
      ((Date.parse(timestamp) - window.start) / (window.end - window.start)) *
        (plotRight - plotLeft);
    const yFor = (value: number): number =>
      plotBottom - (value / maximum) * (plotBottom - plotTop);

    const root = svg("svg", {
      class: "chart-svg",
      viewBox: `0 0 ${VIEW_WIDTH} ${tokens.height}`,
      role: "img",
    });
    const title = svg("title");
    title.textContent = `Response time history for ${serviceName}`;
    root.append(title);

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

    if (activeTimestamp) {
      const values = responseValuesAtTimestamp(filtered, activeTimestamp);
      if (values.length > 0) {
        const x = xFor(activeTimestamp);
        const group = svg("g", { class: "chart-hover", "aria-hidden": "true" });
        /*
          The strip the pointer rides on, sized and coloured entirely in the
          stylesheet: its width is a design decision and its position is not,
          so the drawing states where it stands and the theme states how wide
          it is. It is centred on that position by a transform against its own
          box, since only the theme knows the width to halve.
        */
        group.append(
          svg("rect", {
            class: "chart-needle",
            x,
            y: 0,
            height: tokens.height,
          }),
          svg("line", {
            class: "chart-crosshair",
            x1: x,
            y1: 0,
            x2: x,
            y2: tokens.height,
          }),
        );
        for (const value of values) {
          const dot = svg("circle", {
            class: "chart-hover-point",
            cx: x,
            cy: yFor(value.responseTimeMs),
            r: tokens.pointRadius + 1,
          });
          dot.dataset.protocol = value.protocol;
          group.append(dot);
        }
        root.append(group);
        // The reading itself goes on the document's own layer rather than into
        // this drawing, whose wrapper carries `overflow: hidden` for the
        // disclosure animation and whose card carries a `clip-path` in two
        // themes. It is shown once the drawing is in the document, because the
        // overlay measures the plot to place itself and an element that has
        // just been emptied measures as nothing.
        pendingReading = { plotX: x, timestamp: activeTimestamp, values };
      }
    }

    /*
      The printed scale.

      Drawn here rather than as a background on the plot, because it belongs
      between the readings and the two labels under them and both of those are
      in the drawing's own units: a scale positioned in pixels would drift away
      from them as the chart scales. A design that prints none sets its tick
      heights to zero and this draws nothing.
    */
    if (tokens.tickStep > 0 && (tokens.tickMajor > 0 || tokens.tickMinor > 0)) {
      const ticks = svg("g", { class: "chart-ticks", "aria-hidden": "true" });
      let index = 0;
      for (let x = plotLeft; x <= plotRight + 0.01; x += tokens.tickStep) {
        const major = index % Math.max(1, tokens.tickMajorEvery) === 0;
        // Every tick stands on the time axis and reaches up by its own
        // length, which is how a printed scale is set: the foot is the
        // measure and the head says how important the mark is.
        ticks.append(
          svg("line", {
            class: major ? "chart-tick chart-tick--major" : "chart-tick",
            x1: x,
            y1: plotBottom - (major ? tokens.tickMajor : tokens.tickMinor),
            x2: x,
            y2: plotBottom,
          }),
        );
        index += 1;
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
    axisFrom.textContent = RANGE_LABEL[range];

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

    // Now that the drawing is back in the document, the plot has a size again
    // and the overlay can be placed against it.
    if (pendingReading) {
      showReading(
        pendingReading.plotX,
        pendingReading.timestamp,
        pendingReading.values,
      );
      pendingReading = null;
    } else {
      tooltip.hide();
      report?.(null);
    }
  }

  /** Moves the crosshair to whichever measurement is nearest the pointer. */
  function onPointerMove(event: PointerEvent): void {
    const box = plotBox();
    if (box.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const window = responseRangeWindow(range, generatedAt);
    const next = nearestResponseTimestamp(
      availableResponseTimestamps(filterResponseSeries(series, range, generatedAt)),
      window.start + ratio * (window.end - window.start),
    );
    if (next === activeTimestamp) return;
    activeTimestamp = next;
    render();
  }

  function clearHover(): void {
    if (activeTimestamp === null) return;
    activeTimestamp = null;
    render();
  }

  /** Arrow keys step between measurements, so the chart is reachable without a pointer. */
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const timestamps = availableResponseTimestamps(
      filterResponseSeries(series, range, generatedAt),
    );
    if (timestamps.length === 0) return;
    const current = activeTimestamp
      ? timestamps.indexOf(activeTimestamp)
      : timestamps.length - 1;
    const next = Math.min(
      timestamps.length - 1,
      Math.max(0, current + (event.key === "ArrowLeft" ? -1 : 1)),
    );
    activeTimestamp = timestamps[next] ?? null;
    render();
  }

  plotHost.addEventListener("pointermove", onPointerMove);
  plotHost.addEventListener("pointerleave", clearHover);
  plotHost.addEventListener("blur", clearHover);
  plotHost.addEventListener("keydown", onKeyDown);
  plotHost.addEventListener("focus", () => {
    const timestamps = availableResponseTimestamps(
      filterResponseSeries(series, range, generatedAt),
    );
    activeTimestamp = timestamps.at(-1) ?? null;
    render();
  });

  return {
    update(nextSeries, nextRange) {
      series = nextSeries;
      range = nextRange;
      activeTimestamp = null;
      render();
    },
  };
}
