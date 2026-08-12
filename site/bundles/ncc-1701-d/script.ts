/**
 * What NCC-1701-D does once its markup is on the page.
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
  type ChartView,
} from "@velvet/bundle-plugins/response-chart";
import {
  barsForRange,
  uptimeForRange,
  type RangeKey,
} from "@velvet/bundle-plugins/status";
import {
  createUptimeStrip,
  type UptimeStrip,
  type UptimeStripStyle,
} from "@velvet/bundle-plugins/uptime-strip";

import type { BundleData } from "../../src/lib/bundles/data.js";
import { rangeNamed } from "./format.js";

/**
 * The strip's geometry: square segments with a capsule at either end of the
 * track, which is what turns a row of separate blocks into one divided bar.
 * No gloss, because nothing on this panel is lit from in front.
 */
const STRIP_GEOMETRY = {
  height: 26,
  hoverHeight: 34,
  gap: 2,
  radius: 0,
  narrowRadius: 0,
  trackRadius: 999,
  gloss: false,
  align: "center",
  pieces: 1,
  pieceGap: 0,
} as const;

/**
 * The plot: edge to edge, a heavy trace over a strong wash, and its readings
 * labelled against the grid rather than only at the two ends of the range.
 * It prints no scale of ticks, so their lengths are nought.
 */
const CHART_GEOMETRY = {
  height: 168,
  insetInline: 0,
  insetBlock: 22,
  gridLines: 3,
  lineWidth: 3,
  pointRadius: 5,
  tooltipWidth: 152,
  fill: 0.42,
  tickMinor: 0,
  tickMajor: 0,
} as const;

/** One state colour, as the stylesheet resolved it. */
function colourOf(style: CSSStyleDeclaration, name: string): string {
  return style.getPropertyValue(name).trim();
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
  const page = root.querySelector<HTMLElement>(".ncc-1701-d-page") ?? root;
  const undo: Array<() => void> = [];
  const rows: Row[] = [];
  let range = data.site.defaultRange as RangeKey;

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
    const chartHost = element.querySelector<HTMLElement>(".chart-host");
    const details = element.querySelector<HTMLElement>(".service-details-wrap");
    if (!entry || !summary || !uptime || !axisFrom || !stripHost || !chartHost || !details) {
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
      chart: createChartView(chartHost, entry.id, entry.name, data.generatedAt, {
        style: CHART_GEOMETRY,
        tooltipClassName: "uptime-tooltip chart-reading",
        // The reading lives on the document rather than inside the service, so
        // it inherits nothing from it: a design that colours a series by
        // service has to hand those colours over.
        seriesColours: () => {
          const inherited = getComputedStyle(chartHost);
          return {
            ipv4: inherited.getPropertyValue("--series-own").trim(),
            ipv6: inherited.getPropertyValue("--series-next").trim(),
          };
        },
      }),
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
    for (const button of buttons) {
      button.setAttribute("aria-pressed", String(button.dataset.range === next));
    }
    placeMark(true);
    refresh();
  }

  /** Redraws every service for the current range. */
  function refresh(): void {
    const from = rangeNamed(range).from;
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
