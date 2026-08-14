/**
 * What Velvet does once its markup is on the page.
 *
 * It is handed the element the template's markup was put into, and the same data
 * the template rendered from. It fetches nothing: everything a range change
 * needs is already in the object it was given, which is the point of the host
 * loading the data rather than the design.
 *
 * Whatever it returns is called when the page goes away, so a preview frame can
 * swap one design for another without leaving listeners behind.
 *
 * Two kinds of value are settled in two different places, on purpose. A colour
 * is in the stylesheet, because the rest of the page is painted in the same
 * ones, and it is read back here. The strip's and the chart's geometry is here,
 * because nothing but the drawing uses it and a token nothing reads is a value
 * with two homes.
 */

import { disclosure } from "@velvet/bundle-plugins/disclosure";
import {
  createChartView,
  type ChartLegendEntry,
  type ChartView,
} from "@velvet/bundle-plugins/response-chart";
import {
  readOpen,
  readRange,
  writeOpen,
  writeRange,
} from "@velvet/bundle-plugins/preferences";
import {
  barsForRange,
  rangeLabel,
  uptimeForRange,
  type RangeKey,
} from "@velvet/bundle-plugins/status";
import {
  createUptimeStrip,
  type UptimeStrip,
  type UptimeStripStyle,
} from "@velvet/bundle-plugins/uptime-strip";

import type { BundleData } from "../../src/lib/bundles/data.js";

/**
 * The strip's geometry, which is `bar` from `site/src/lib/tokens.ts` exactly:
 * 32 tall, 38 hovered, 2 apart, 2 rounded, and a capsule in the 90-day view.
 */
const STRIP_GEOMETRY = {
  height: 32,
  hoverHeight: 38,
  gap: 2,
  radius: 2,
  narrowRadius: 999,
  trackRadius: 2,
  gloss: true,
  align: "center",
  pieces: 1,
  pieceGap: 0,
} as const;

/**
 * The plot box from `ResponseTimeChart.svelte`: 148 tall, inset 12, three
 * rules, a 2px stroke, points at 3, and the 0.28 fill its own gradient
 * declares. Velvet prints no scale of ticks, so the tick lengths are nought.
 */
const CHART_GEOMETRY = {
  height: 148,
  insetInline: 12,
  insetBlock: 12,
  gridLines: 3,
  lineWidth: 2,
  pointRadius: 3,
  fill: 0.28,
  tickMinor: 0,
  tickMajor: 0,
} as const;

/** One state colour, as the stylesheet resolved it. */
function colourOf(style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(name).trim();
}

/**
 * Writes the chart's legend, which is this design's markup rather than the
 * plugin's.
 *
 * A key in the series' own colour, the protocol, and its latest reading, on one
 * row per protocol that answered. The plugin says which those are and what they
 * read; the shape is here.
 *
 * @param host - The list the rows go into. Emptied first.
 * @param entries - One per protocol, in the order the data carries them.
 */
function drawLegend(host: HTMLElement, entries: ChartLegendEntry[]): void {
  host.textContent = "";
  for (const entry of entries) {
    const item = document.createElement("span");
    item.className = "chart-legend-item";
    item.setAttribute("role", "listitem");
    item.dataset.protocol = entry.protocol;
    const key = document.createElement("span");
    key.className = "chart-line-key";
    key.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.textContent = entry.label;
    const reading = document.createElement("strong");
    reading.textContent = entry.value;
    item.append(key, name, reading);
    host.append(item);
  }
}

/** What one service row owns, so a range change can reach into it. */
interface Row {
  id: string;
  name: string;
  spoken: string;
  open: boolean;
  root: HTMLElement;
  summary: HTMLButtonElement;
  uptime: HTMLElement;
  axisFrom: HTMLElement;
  /** The left end of the chart's range, which the design prints itself. */
  chartFrom: HTMLElement;
  strip: UptimeStrip;
  chart: ChartView;
  chartBuilt: boolean;
  panel: ReturnType<typeof disclosure>;
}

/**
 * Wires every control on the page.
 *
 * @param root - The element the markup was rendered into.
 * @param data - The status data the host handed over.
 * @returns The function that undoes everything this attached.
 */
export function enhance(root: HTMLElement, data: BundleData): () => void {
  const page = root.querySelector<HTMLElement>(".velvet-page") ?? root;
  const undo: Array<() => void> = [];
  const rows: Row[] = [];
  let range = readRange(data.site.defaultRange as RangeKey);

  /**
   * The strip's appearance as it stands now.
   *
   * Read on every paint rather than once, because a stylesheet arrives when it
   * arrives: a palette read before it applied is a strip drawn in nothing at
   * all, and reading it again is what makes the drawing follow the design
   * whenever the design turns up.
   */
  const stripStyle = (): UptimeStripStyle => {
    const palette = getComputedStyle(page);
    return {
      ...STRIP_GEOMETRY,
      operational: colourOf(palette, "--state-operational"),
      degraded: colourOf(palette, "--state-degraded"),
      outage: colourOf(palette, "--state-outage"),
      noData: colourOf(palette, "--state-no-data"),
      maintenance: colourOf(palette, "--state-maintenance"),
      maintenanceEdge: colourOf(palette, "--state-maintenance-edge"),
      ghostEdge: colourOf(palette, "--state-ghost-edge"),
    };
  };

  // ── The rows ───────────────────────────────────────────────────────────────
  for (const element of page.querySelectorAll<HTMLElement>(".service")) {
    const id = element.dataset.serviceId ?? "";
    const entry = data.status.services.find((candidate) => candidate.id === id);
    const summary = element.querySelector<HTMLButtonElement>(".service-summary");
    const uptime = element.querySelector<HTMLElement>(".service-uptime");
    const axisFrom = element.querySelector<HTMLElement>(".strip-axis-from");
    const stripHost = element.querySelector<HTMLElement>(".uptime-strip-host");
    const chartPlot = element.querySelector<HTMLElement>(".chart-plot");
    const chartLegend = element.querySelector<HTMLElement>(".chart-legend");
    const chartFrom = element.querySelector<HTMLElement>(".chart-axis-from");
    const details = element.querySelector<HTMLElement>(".service-details-wrap");
    if (
      !entry ||
      !summary ||
      !uptime ||
      !axisFrom ||
      !stripHost ||
      !chartPlot ||
      !chartLegend ||
      !chartFrom ||
      !details
    ) {
      continue;
    }

    const row: Row = {
      id,
      name: entry.name,
      spoken: entry.checks
        .map((check) => (check.protocol === "ipv6" ? "IPv6" : "IPv4"))
        .join(" and "),
      open: false,
      root: element,
      summary,
      uptime,
      axisFrom,
      strip: createUptimeStrip(stripHost, {
        style: stripStyle,
        heightProperty: "--strip-surface-height",
        tooltipClassName: "uptime-tooltip",
      }),
      chartFrom,
      chart: createChartView(
        chartPlot,
        entry.id,
        entry.name,
        data.generatedAt,
        data.status.monitoringStartedAt,
        {
          style: CHART_GEOMETRY,
          tooltipClassName: "uptime-tooltip chart-reading",
          legend: (entries) => drawLegend(chartLegend, entries),
        },
      ),
      chartBuilt: false,
      panel: disclosure(details, false),
    };
    rows.push(row);

    const onClick = (): void => {
      setOpen(row, !row.open);
      reflectToggleAll();
    };
    summary.addEventListener("click", onClick);
    undo.push(() => {
      summary.removeEventListener("click", onClick);
      row.strip.destroy();
      row.chart.destroy();
      row.panel.destroy();
    });
  }

  // ── The ranges ─────────────────────────────────────────────────────────────
  const track = page.querySelector<HTMLElement>(".ranges");
  const mark = page.querySelector<HTMLElement>(".range-mark");
  const buttons = [...page.querySelectorAll<HTMLButtonElement>(".range-button")];
  for (const button of buttons) {
    const onClick = (): void => selectRange((button.dataset.range ?? "month") as RangeKey);
    button.addEventListener("click", onClick);
    undo.push(() => button.removeEventListener("click", onClick));
  }

  const toggleAll = page.querySelector<HTMLButtonElement>(".toggle-all");
  if (toggleAll) {
    const onClick = (): void => {
      const opening = !rows.every((row) => row.open);
      for (const row of rows) setOpen(row, opening);
      reflectToggleAll();
    };
    toggleAll.addEventListener("click", onClick);
    undo.push(() => toggleAll.removeEventListener("click", onClick));
  }

  /**
   * Opens or closes one service.
   *
   * The chart is built the first time a service is opened rather than with the
   * page. Five services with two protocols each is ten charts nobody has asked
   * to see, and the arithmetic behind one is a filter over roughly 1 200
   * samples followed by a downsample.
   */
  function setOpen(row: Row, open: boolean): void {
    if (row.open === open) return;
    row.open = open;
    row.root.dataset.open = String(open);
    row.summary.setAttribute("aria-expanded", String(open));
    writeOpen(row.id, open);
    if (open && !row.chartBuilt) {
      row.chart.update(
        data.responseTimes.series.filter(({ serviceId }) => serviceId === row.id),
        range,
      );
      row.chartBuilt = true;
    }
    row.panel.update(open);
  }

  /** Keeps the expand-all control showing what it would do next. */
  function reflectToggleAll(): void {
    if (!toggleAll) return;
    const allOpen = rows.length > 0 && rows.every((row) => row.open);
    toggleAll.classList.toggle("is-expanded", allOpen);
    toggleAll.setAttribute("aria-label", allOpen ? "Collapse all" : "Expand all");
    toggleAll.title = allOpen ? "Collapse all" : "Expand all";
  }

  /**
   * Puts the mark under the chosen range.
   *
   * Measured rather than calculated from the labels, because the buttons are as
   * wide as their type and that depends on the face and the tracking.
   *
   * @param animate - False on the first placement, so the mark does not slide in
   *   from the left edge when the page opens.
   */
  function placeMark(animate: boolean): void {
    const button = buttons.find((candidate) => candidate.dataset.range === range);
    if (!mark || !track || !button) return;
    if (track.getBoundingClientRect().width === 0) return;
    mark.style.transition = animate ? "" : "none";
    mark.style.width = `${button.offsetWidth}px`;
    mark.style.transform = `translateX(${button.offsetLeft}px)`;
    if (!animate) {
      // Forces the browser to take the un-animated position before the
      // transition is handed back, so the next change animates from here.
      void mark.offsetWidth;
      mark.style.transition = "";
    }
  }

  /** Switches the range and refreshes everything that depends on it. */
  function selectRange(next: RangeKey): void {
    range = next;
    writeRange(next);
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.range === next));
    }
    placeMark(true);
    refresh();
  }

  /** Redraws every service for the current range. */
  function refresh(): void {
    const from = rangeLabel(range, data.status.monitoringStartedAt);
    for (const row of rows) {
      const entry = data.status.services.find(({ id }) => id === row.id);
      if (!entry) continue;
      const figure = uptimeForRange(
        entry,
        range,
        data.status.generatedAt,
        data.status.monitoringStartedAt,
      );
      row.uptime.textContent = `${figure} uptime`;
      // Rewritten with the figure, because the label replaces the contents and
      // the figure is half of what the row says.
      row.summary.setAttribute(
        "aria-label",
        [row.name, `${figure} uptime`, row.spoken].filter(Boolean).join(", "),
      );
      row.strip.update(
        barsForRange(
          entry,
          range,
          data.status.generatedAt,
          data.status.monitoringStartedAt,
          data.incidents.events,
        ),
        range,
      );
      row.axisFrom.textContent = from;
      row.chartFrom.textContent = from;
      if (row.chartBuilt) {
        row.chart.update(
          data.responseTimes.series.filter(({ serviceId }) => serviceId === row.id),
          range,
        );
      }
    }
  }

  /**
   * Tracks the credit's label out until it ends where the wordmark ends.
   *
   * Measured rather than stated, because the two lines are set in different
   * faces at different sizes and only the browser knows what either comes to.
   */
  const powered = page.querySelector<HTMLElement>(".powered");
  function fitPoweredLabel(): void {
    const wordmark = powered?.querySelector<HTMLElement>(".velvet-wordmark");
    const label = powered?.querySelector<HTMLElement>(".powered-label");
    if (!wordmark || !label) return;
    label.style.removeProperty("--powered-label-tracking");
    const natural = label.getBoundingClientRect().width;
    const target = wordmark.getBoundingClientRect().width;
    const gaps = (label.textContent ?? "").length - 1;
    if (gaps <= 0 || natural <= 0 || target <= natural) return;
    label.style.setProperty(
      "--powered-label-tracking",
      `${(target - natural) / gaps}px`,
    );
  }

  const watch = new ResizeObserver(() => {
    placeMark(false);
    fitPoweredLabel();
  });
  if (track) watch.observe(track);
  if (powered) watch.observe(powered);
  undo.push(() => watch.disconnect());

  // The markup was written with the installation's own default, so the keys
  // have to be told which window this visitor actually left the page on.
  for (const button of buttons) {
    button.setAttribute("aria-pressed", String(button.dataset.range === range));
  }
  // Whatever this visitor left open, before the first draw, so a restored row
  // is drawn open rather than opening itself once the page is already there.
  for (const row of rows) setOpen(row, readOpen(row.id));
  reflectToggleAll();
  refresh();
  placeMark(false);
  // The buttons are as wide as their type, so a face arriving late moves them
  // and the mark follows.
  void document.fonts?.ready.then(() => {
    placeMark(false);
    fitPoweredLabel();
  });

  return () => {
    for (const step of undo) step();
  };
}

export default enhance;
