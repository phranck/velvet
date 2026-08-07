<script lang="ts">
  import { bar, segGloss } from "../lib/tokens";
  import type { DayStatus, RangeKey } from "../lib/types";

  let {
    days,
    rangeLabel,
    range,
  }: { days: DayStatus[]; rangeLabel: string; range: RangeKey } = $props();

  /*
   * Built once rather than per call.
   *
   * `toLocaleDateString(value, options)` constructs a formatter every time it
   * runs, and a quarter of a year is 90 entries for each service.
   */
  const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  const FULL_DATE = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const MAINTENANCE_TIME = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  /** How much taller the day under the pointer is drawn. */
  const HOVER_SCALE = 1.12;

  let host = $state<HTMLDivElement | undefined>();
  let canvas = $state<HTMLCanvasElement | undefined>();
  let probes = $state<HTMLDivElement | undefined>();
  /** Width of the strip in CSS pixels, tracked so a resize redraws it. */
  let stripWidth = $state(0);
  /** Ratio it is drawn at, tracked so moving to another screen redraws it. */
  let pixelRatio = $state(1);
  /** The day under the pointer, or null when the pointer is elsewhere. */
  let hovered = $state<number | null>(null);

  const radius = $derived(range === "quarter" ? bar.narrowRadius : bar.radius);
  const maintenanceDays = $derived(
    days.filter((day) => day.maintenance.length > 0),
  );
  /**
   * What the drawing says, in words.
   *
   * The strip used to be one element per day, each carrying its own state, and
   * a canvas carries none. This is the whole strip in a sentence, which is what
   * somebody hearing the page rather than seeing it needs from it.
   */
  const summary = $derived.by(() => {
    // A plain object rather than a Map, since this counts inside a derivation
    // and is thrown away with it; a reactive Map would track nothing useful.
    const counted: Record<string, number> = {};
    for (const day of days) {
      const name = day.maintenance.length > 0 ? "under maintenance" : label(day);
      counted[name] = (counted[name] ?? 0) + 1;
    }
    const parts = Object.entries(counted)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${count} ${name.split(" · ")[0]}`);
    return parts.length === 0
      ? "Availability history: nothing recorded yet."
      : `Availability history: ${parts.join(", ")}.`;
  });

  /**
   * Which palette entry a day is painted in.
   *
   * A day nothing was measured on takes the no-data colour whatever its status
   * says, because a status carried by no measurement describes nothing. That
   * order matters: such a day can still be recorded as operational, and reading
   * the status first would paint an empty day as a working one.
   */
  function statusColour(day: DayStatus): string {
    if (day.maintenance.length > 0 && day.status === "operational") {
      return "--grid-maintenance";
    }
    if (!day.hasData && day.maintenance.length === 0) return "--grid-no-data";
    if (day.status === "operational") return "--grid-operational";
    if (day.status === "unknown") return "--grid-no-data";
    if (day.status === "degraded") return "--grid-degraded";
    return "--grid-outage";
  }

  function label(d: DayStatus): string {
    if (!d.hasData) return "no data";
    if (d.status === "operational") return "operational";
    if (d.status === "unknown") return "status unknown";
    if (d.status === "degraded") return `degraded · ${d.minutesDown} min down`;
    return `outage · ${d.minutesDown} min`;
  }

  function maintenanceLabel(d: DayStatus): string {
    return d.maintenance
      .map((event) => {
        const startsAt = MAINTENANCE_TIME.format(new Date(event.startsAt));
        const endsAt = MAINTENANCE_TIME.format(new Date(event.endsAt));
        return `Maintenance: ${event.title}\n${startsAt} – ${endsAt}`;
      })
      .join("\n");
  }

  function tip(d: DayStatus): string {
    const end = new Date(`${d.date}T00:00:00Z`);
    // Aggregated bar (1y / all): show the bucket's date span instead of one day.
    if (d.spanDays > 1) {
      const start = new Date(
        end.getTime() - (d.spanDays - 1) * 24 * 60 * 60 * 1_000,
      );
      return [
        `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`,
        label(d),
        maintenanceLabel(d),
      ]
        .filter(Boolean)
        .join("\n");
    }
    return [FULL_DATE.format(end), label(d), maintenanceLabel(d)]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Reads back a colour the stylesheet has already worked out.
   *
   * A canvas understands neither `var()` nor `color-mix()`, so the values it
   * paints with are taken from elements carrying those declarations. That keeps
   * one definition of the palette instead of a second copy in here.
   */
  function resolved(name: string): string {
    const probe = probes?.querySelector<HTMLElement>(`[data-probe="${name}"]`);
    return probe ? getComputedStyle(probe).backgroundColor : "transparent";
  }

  /** Where a day sits along the strip, in CSS pixels. */
  function slot(index: number, total: number, width: number) {
    const each = (width - bar.gap * (total - 1)) / total;
    return { x: index * (each + bar.gap), width: each };
  }

  /** The day under a pointer at this offset, or null past either end. */
  function dayAt(offsetX: number, total: number, width: number): number | null {
    if (total === 0 || width <= 0) return null;
    const each = (width - bar.gap * (total - 1)) / total;
    const index = Math.floor(offsetX / (each + bar.gap));
    return index >= 0 && index < total ? index : null;
  }

  /** Draws the whole strip once. */
  function paint(): void {
    const element = canvas;
    if (!element || stripWidth <= 0) return;
    const context = element.getContext("2d");
    if (!context) return;

    const height = bar.height;
    element.width = Math.round(stripWidth * pixelRatio);
    element.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, stripWidth, height);

    const gloss = context.createLinearGradient(0, 0, 0, height);
    for (const stop of segGloss) {
      gloss.addColorStop(stop.offset, `rgba(${stop.rgb}, ${stop.opacity})`);
    }
    const ghostEdge = resolved("ghost-edge");
    const maintenanceEdge = resolved("maintenance-edge");

    days.forEach((day, index) => {
      const { x, width } = slot(index, days.length, stripWidth);
      const lifted = index === hovered;

      const drawnHeight = height * (lifted ? HOVER_SCALE : 1);
      const y = (height - drawnHeight) / 2;
      const fitted = Math.min(radius, width / 2, drawnHeight / 2);

      // A day nothing was measured on is flat, and carries an edge instead of
      // the gloss: nothing was recorded, so there is no surface to catch light.
      const empty = !day.hasData && day.maintenance.length === 0;

      context.beginPath();
      context.roundRect(x, y, width, drawnHeight, fitted);
      context.fillStyle = resolved(statusColour(day));
      context.fill();
      if (!empty) {
        context.fillStyle = gloss;
        context.fill();
      }

      // The two states that carry an inset edge rather than a plain fill.
      const edge = empty
        ? ghostEdge
        : day.maintenance.length > 0
          ? maintenanceEdge
          : null;
      if (!edge) return;
      context.beginPath();
      context.roundRect(
        x + 0.5,
        y + 0.5,
        Math.max(width - 1, 0),
        Math.max(drawnHeight - 1, 0),
        Math.max(fitted - 0.5, 0),
      );
      context.strokeStyle = edge;
      context.lineWidth = 1;
      context.stroke();
    });
  }

  function trackPointer(event: PointerEvent): void {
    if (!host) return;
    const box = host.getBoundingClientRect();
    hovered = dayAt(event.clientX - box.left, days.length, box.width);
  }

  $effect(() => {
    const element = host;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      stripWidth = entry?.contentRect.width ?? 0;
    });
    observer.observe(element);
    stripWidth = element.getBoundingClientRect().width;
    return () => observer.disconnect();
  });

  $effect(() => {
    pixelRatio = window.devicePixelRatio || 1;
    // Fires when the window moves to a screen of another density, which is the
    // one case where nothing else about this component changes.
    const query = window.matchMedia(`(resolution: ${pixelRatio}dppx)`);
    const update = (): void => {
      pixelRatio = window.devicePixelRatio || 1;
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  });

  $effect(() => {
    // Listed so the dependencies are visible: the drawing reads all of these.
    void days;
    void radius;
    void stripWidth;
    void pixelRatio;
    void hovered;
    paint();
  });
</script>

<!--
  Drawn rather than assembled from one element per day.

  A quarter of a year is 90 days for each service, and 90 rounded boxes are
  re-rasterised by everything that repaints the page. A canvas is rasterised
  once and composited afterwards. Traced over six expand-all cycles at 90 days
  with four services: 695ms of rasterisation as boxes against 315ms as a canvas,
  drawing the same shapes.
-->
<div
  class="bar"
  bind:this={host}
  role="img"
  aria-label={summary}
  onpointermove={trackPointer}
  onpointerleave={() => (hovered = null)}
>
  <canvas bind:this={canvas} style:height={`${bar.height}px`} aria-hidden="true"
  ></canvas>
  <div class="probes" bind:this={probes} aria-hidden="true">
    <div data-probe="--grid-operational"></div>
    <div data-probe="--grid-degraded"></div>
    <div data-probe="--grid-outage"></div>
    <div data-probe="--grid-no-data"></div>
    <div data-probe="--grid-maintenance"></div>
    <div data-probe="ghost-edge"></div>
    <div data-probe="maintenance-edge"></div>
  </div>
  {#if hovered !== null && days[hovered]}
    {@const spot = slot(hovered, days.length, stripWidth)}
    <div
      class="tip mono"
      role="status"
      style:left={`${spot.x + spot.width / 2}px`}
    >{tip(days[hovered])}</div>
  {/if}
</div>
{#if maintenanceDays.length > 0}
  <!--
    What the drawing cannot say. Each day used to carry its own label, and a
    canvas carries none, so the maintenance windows are named here instead.
    They are the part of the strip a reader could not otherwise reach.
  -->
  <ul class="visually-hidden">
    {#each maintenanceDays as day (day.date)}
      <li>{tip(day)}</li>
    {/each}
  </ul>
{/if}
<div class="labels mono">
  <span>{rangeLabel}</span>
  <span>Today</span>
</div>

<style>
  .bar {
    position: relative;
    height: var(--bar-height);
    margin-top: 11px;
  }
  canvas {
    display: block;
    width: 100%;
  }
  .probes {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }
  .probes [data-probe="--grid-operational"] {
    background: var(--grid-operational);
  }
  .probes [data-probe="--grid-degraded"] {
    background: var(--grid-degraded);
  }
  .probes [data-probe="--grid-outage"] {
    background: var(--grid-outage);
  }
  .probes [data-probe="--grid-no-data"] {
    background: var(--grid-no-data);
  }
  .probes [data-probe="--grid-maintenance"] {
    background: var(--grid-maintenance);
  }
  .probes [data-probe="ghost-edge"] {
    background: color-mix(in srgb, var(--text-tertiary) 14%, transparent);
  }
  .probes [data-probe="maintenance-edge"] {
    background: color-mix(
      in srgb,
      var(--grid-maintenance) 72%,
      var(--text-primary)
    );
  }
  .tip {
    position: absolute;
    bottom: calc(100% + 9px);
    transform: translateX(-50%);
    white-space: pre;
    width: max-content;
    text-align: center;
    line-height: 1.5;
    padding: 7px 12px;
    border-radius: 8px;
    background: var(--popover-bg);
    border: 1px solid var(--popover-border);
    color: var(--text);
    font-size: 12px;
    pointer-events: none;
    z-index: 5;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .labels {
    display: flex;
    justify-content: space-between;
    margin-top: 7px;
    font-size: var(--labels-size);
    color: var(--text-faint);
  }
</style>
