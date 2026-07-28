<script lang="ts">
  import type { RangeKey, ResponseTimesDocument } from "../../lib/types";
  import { RANGE_LABEL } from "../../lib/data";
  import {
    availableResponseTimestamps,
    downsampleResponseSamples,
    filterResponseSeries,
    monotonePath,
    nearestResponseTimestamp,
    responseValuesAtTimestamp,
    responseRangeWindow,
  } from "../../lib/response-chart";
  import type { VelvetTheme } from "../../lib/config";
  import { protocolLabel } from "../../lib/protocol";

  type ResponseSeries = ResponseTimesDocument["series"];
  type ResponseSample = ResponseSeries[number]["samples"][number];
  type AvailableSample = ResponseSample & { responseTimeMs: number };

  let {
    serviceId,
    serviceName,
    series,
    range,
    generatedAt,
    chart,
  }: {
    serviceId: string;
    serviceName: string;
    series: ResponseSeries;
    range: RangeKey;
    generatedAt: string;
    chart: VelvetTheme["chart"];
  } = $props();

  const WIDTH = 640;
  const HEIGHT = 148;
  const PLOT_LEFT = 12;
  const PLOT_RIGHT = 628;
  const PLOT_TOP = 12;
  const PLOT_BOTTOM = 116;
  const MAX_POINTS = 96;
  const TOOLTIP_WIDTH = 136;
  const PROTOCOLS = ["ipv4", "ipv6"] as const;

  const titleId = $derived(`response-chart-${serviceId}-title`);
  const descriptionId = $derived(`response-chart-${serviceId}-description`);
  const summaryId = $derived(`response-chart-${serviceId}-summary`);
  const filteredSeries = $derived(
    filterResponseSeries(series, range, generatedAt),
  );
  const preparedSeries = $derived.by(() =>
    filteredSeries.map((entry) => ({
      ...entry,
      samples: downsampleResponseSamples(entry.samples, MAX_POINTS),
    })),
  );
  const hasSamples = $derived(
    filteredSeries.some(({ samples }) => samples.length > 0),
  );
  const maximumResponse = $derived.by(() => {
    let maximum = 1;
    for (const entry of filteredSeries) {
      for (const sample of entry.samples) {
        if (
          sample.responseTimeMs !== null &&
          sample.responseTimeMs > maximum
        ) {
          maximum = sample.responseTimeMs;
        }
      }
    }
    return maximum;
  });
  const description = $derived(
    `${filteredSeries
      .filter(({ samples }) => samples.length > 0)
      .map(seriesSummary)
      .join(" ")} Unavailable samples create gaps in the chart.`,
  );
  const hoverTimestamps = $derived(
    availableResponseTimestamps(filteredSeries),
  );
  let activeTimestamp = $state<string | null>(null);
  const activeValues = $derived(
    activeTimestamp
      ? responseValuesAtTimestamp(filteredSeries, activeTimestamp)
      : [],
  );
  const activeX = $derived(
    activeTimestamp ? xForTimestamp(activeTimestamp) : PLOT_LEFT,
  );
  const tooltipX = $derived(
    activeX + TOOLTIP_WIDTH + 8 > PLOT_RIGHT
      ? activeX - TOOLTIP_WIDTH - 8
      : activeX + 8,
  );

  function formatMilliseconds(value: number | null | undefined): string {
    return value === null || value === undefined
      ? "unavailable"
      : `${Math.round(value)} ms`;
  }

  function seriesSummary(entry: ResponseSeries[number]): string {
    const current = entry.samples.at(-1)?.responseTimeMs;
    let minimum: number | null = null;
    let maximum: number | null = null;
    let unavailableCount = 0;
    for (const sample of entry.samples) {
      if (sample.responseTimeMs === null) {
        unavailableCount += 1;
        continue;
      }
      minimum =
        minimum === null
          ? sample.responseTimeMs
          : Math.min(minimum, sample.responseTimeMs);
      maximum =
        maximum === null
          ? sample.responseTimeMs
          : Math.max(maximum, sample.responseTimeMs);
    }
    const unavailableText =
      unavailableCount === 0
        ? "no unavailable samples"
        : `${unavailableCount} unavailable ${unavailableCount === 1 ? "sample" : "samples"}`;
    return `${protocolLabel(entry)}: current ${formatMilliseconds(current)}, minimum ${formatMilliseconds(minimum)}, maximum ${formatMilliseconds(maximum)}, ${unavailableText}.`;
  }

  function availableSegments(samples: ResponseSample[]): AvailableSample[][] {
    const segments: AvailableSample[][] = [];
    let current: AvailableSample[] = [];
    for (const sample of samples) {
      if (sample.responseTimeMs === null) {
        if (current.length > 0) segments.push(current);
        current = [];
      } else {
        current.push(sample as AvailableSample);
      }
    }
    if (current.length > 0) segments.push(current);
    return segments;
  }

  function coordinates(sample: AvailableSample): { x: number; y: number } {
    return {
      x: xForTimestamp(sample.timestamp),
      y: yForResponse(sample.responseTimeMs),
    };
  }

  function pathFor(samples: AvailableSample[]): string {
    return monotonePath(samples.map(coordinates));
  }

  function areaPath(samples: AvailableSample[]): string {
    const first = coordinates(samples[0]!);
    const last = coordinates(samples.at(-1)!);
    return `${pathFor(samples)} L${last.x.toFixed(2)} ${PLOT_BOTTOM} L${first.x.toFixed(2)} ${PLOT_BOTTOM} Z`;
  }

  function lineStyle(
    protocol: "ipv4" | "ipv6",
  ): VelvetTheme["chart"]["ipv4LineStyle"] {
    return protocol === "ipv4"
      ? chart.ipv4LineStyle
      : chart.ipv6LineStyle;
  }

  function gradientId(protocol: "ipv4" | "ipv6"): string {
    return `response-chart-${serviceId}-${protocol}-fill`;
  }

  function xForTimestamp(timestamp: string): number {
    const { start, end } = responseRangeWindow(range, generatedAt);
    return (
      PLOT_LEFT +
      ((Date.parse(timestamp) - start) / (end - start)) *
        (PLOT_RIGHT - PLOT_LEFT)
    );
  }

  function yForResponse(responseTimeMs: number): number {
    return (
      PLOT_BOTTOM -
      (responseTimeMs / maximumResponse) * (PLOT_BOTTOM - PLOT_TOP)
    );
  }

  function selectNearestPointer(
    event: PointerEvent & { currentTarget: HTMLAnchorElement },
  ): void {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    const { start, end } = responseRangeWindow(range, generatedAt);
    activeTimestamp = nearestResponseTimestamp(
      hoverTimestamps,
      start + ratio * (end - start),
    );
  }

  function activateLatest(): void {
    activeTimestamp = hoverTimestamps.at(-1) ?? null;
  }

  function navigateTimestamp(event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = activeTimestamp
      ? hoverTimestamps.indexOf(activeTimestamp)
      : hoverTimestamps.length - 1;
    const offset = event.key === "ArrowLeft" ? -1 : 1;
    const nextIndex = Math.min(
      hoverTimestamps.length - 1,
      Math.max(0, currentIndex + offset),
    );
    activeTimestamp = hoverTimestamps[nextIndex] ?? null;
  }

  function tooltipTimestamp(timestamp: string): string {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  }
</script>

<figure class="response-chart" aria-labelledby={titleId}>
  <figcaption id={titleId}>Response time</figcaption>
  <div class="legend" role="list" aria-label="Response time series">
    {#each filteredSeries.filter(({ samples }) => samples.length > 0) as entry (entry.checkId)}
      <span class="legend-item" role="listitem">
        <span
          class="line-key"
          data-protocol={entry.protocol}
          data-line-style={lineStyle(entry.protocol)}
          aria-hidden="true"
        ></span>
        <span>{protocolLabel(entry)}</span>
        <strong>{formatMilliseconds(entry.samples.at(-1)?.responseTimeMs)}</strong>
      </span>
    {/each}
  </div>

  {#if hasSamples}
    <a
      class="plot-link"
      data-response-hover
      href={`#${summaryId}`}
      aria-label={`Response time chart for ${serviceName}`}
      aria-describedby={summaryId}
      tabindex="0"
      onpointermove={selectNearestPointer}
      onpointerleave={() => (activeTimestamp = null)}
      onfocus={activateLatest}
      onblur={() => (activeTimestamp = null)}
      onkeydown={navigateTimestamp}
    >
      <svg
        class="plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title>Response time history for {serviceName}</title>
        <desc id={descriptionId}>{description}</desc>
        {#if chart.fill}
          <defs>
            {#each PROTOCOLS as protocol (protocol)}
              <linearGradient
                id={gradientId(protocol)}
                data-protocol={protocol}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0" stop-opacity="0.28"></stop>
                <stop offset="1" stop-opacity="0"></stop>
              </linearGradient>
            {/each}
          </defs>
        {/if}
        <g class="grid" aria-hidden="true">
          <line x1={PLOT_LEFT} y1={PLOT_TOP} x2={PLOT_RIGHT} y2={PLOT_TOP}></line>
          <line
            x1={PLOT_LEFT}
            y1={(PLOT_TOP + PLOT_BOTTOM) / 2}
            x2={PLOT_RIGHT}
            y2={(PLOT_TOP + PLOT_BOTTOM) / 2}
          ></line>
          <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_RIGHT} y2={PLOT_BOTTOM}></line>
        </g>
        {#each preparedSeries as entry (entry.checkId)}
          {@const segments = availableSegments(entry.samples)}
          {#each segments as segment (segment[0]?.timestamp)}
            {#if segment.length === 1}
              {@const point = coordinates(segment[0])}
              <circle
                class="series-point"
                data-protocol={entry.protocol}
                data-line-style={lineStyle(entry.protocol)}
                cx={point.x}
                cy={point.y}
                r="3"
              ></circle>
            {:else}
              {#if chart.fill}
                <path
                  class="series-area"
                  data-protocol={entry.protocol}
                  d={areaPath(segment)}
                  fill={`url(#${gradientId(entry.protocol)})`}
                ></path>
              {/if}
              <path
                class="series-line"
                data-protocol={entry.protocol}
                data-line-style={lineStyle(entry.protocol)}
                d={pathFor(segment)}
              ></path>
            {/if}
          {/each}
        {/each}
        {#if activeTimestamp && activeValues.length > 0}
          <g class="hover-indicator" aria-hidden="true">
            <line
              class="hover-crosshair"
              x1={activeX}
              y1={PLOT_TOP}
              x2={activeX}
              y2={PLOT_BOTTOM}
            ></line>
            {#each activeValues as value (value.protocol)}
              <circle
                class="hover-point"
                data-protocol={value.protocol}
                cx={activeX}
                cy={yForResponse(value.responseTimeMs)}
                r="4"
              ></circle>
            {/each}
            <g class="hover-tooltip" transform={`translate(${tooltipX} ${PLOT_TOP + 4})`}>
              <rect
                width={TOOLTIP_WIDTH}
                height={22 + activeValues.length * 18}
                rx="6"
              ></rect>
              <text class="hover-time" x="8" y="14">
                {tooltipTimestamp(activeTimestamp)}
              </text>
              {#each activeValues as value, index (value.protocol)}
                <circle
                  data-protocol={value.protocol}
                  cx="11"
                  cy={28 + index * 18}
                  r="3"
                ></circle>
                <text x="19" y={32 + index * 18}>
                  {protocolLabel(value)} {formatMilliseconds(value.responseTimeMs)}
                </text>
              {/each}
            </g>
          </g>
        {/if}
        <g class="axis-labels mono" aria-hidden="true">
          <text x={PLOT_LEFT} y="140">{RANGE_LABEL[range]}</text>
          <text x={PLOT_RIGHT} y="140" text-anchor="end">Now</text>
        </g>
      </svg>
    </a>
    <p id={summaryId} class="visually-hidden">{description}</p>
  {:else}
    <p class="empty" role="status">No response history for this range.</p>
  {/if}
</figure>

<style>
  .response-chart {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 8px 14px;
    margin: 14px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--border-soft);
  }
  figcaption {
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px 14px;
  }
  .plot-link,
  .empty {
    grid-column: 1 / -1;
  }
  .plot-link {
    display: block;
    border-radius: 6px;
  }
  .legend-item {
    display: inline-grid;
    grid-template-columns: 16px auto auto;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .legend-item strong {
    color: var(--text);
    font-weight: 600;
  }
  .line-key {
    height: 0;
    border-top: 2px solid var(--series-color);
  }
  [data-protocol="ipv4"] {
    --series-color: var(--protocol-ipv4);
  }
  [data-protocol="ipv6"] {
    --series-color: var(--protocol-ipv6);
  }
  [data-line-style="dashed"] {
    stroke-dasharray: 7 5;
    border-top-style: dashed;
  }
  [data-line-style="dotted"] {
    stroke-dasharray: 1 6;
    stroke-linecap: round;
    border-top-style: dotted;
  }
  .plot {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
    border-radius: 6px;
  }
  .plot-link:focus-visible {
    outline: 2px solid var(--accent-bright);
    outline-offset: 4px;
  }
  .grid line {
    stroke: var(--border-soft);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .series-line,
  .series-point,
  .hover-point {
    stroke: var(--series-color);
    vector-effect: non-scaling-stroke;
  }
  .series-area {
    pointer-events: none;
  }
  linearGradient stop {
    stop-color: var(--series-color);
  }
  .series-line {
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .series-point {
    fill: var(--surface-2);
    stroke-width: 2;
  }
  .hover-crosshair {
    stroke: var(--text-tertiary);
    stroke-width: 1;
    stroke-dasharray: 3 4;
    vector-effect: non-scaling-stroke;
  }
  .hover-point {
    fill: var(--surface-2);
    stroke-width: 2;
  }
  .hover-tooltip rect {
    fill: var(--popover-bg);
    stroke: var(--popover-border);
    stroke-width: 1;
  }
  .hover-tooltip text {
    fill: var(--text);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .hover-tooltip .hover-time {
    fill: var(--text-muted);
    font-size: 9px;
  }
  .hover-tooltip circle {
    fill: var(--series-color);
  }
  .axis-labels {
    fill: var(--text-faint);
    font-size: 10px;
  }
  .empty {
    margin: 8px 0 2px;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (max-width: 440px) {
    .response-chart {
      grid-template-columns: 1fr;
    }
    .legend {
      justify-content: flex-start;
    }
  }

  @media (forced-colors: active) {
    .series-line,
    .series-point {
      stroke: CanvasText;
    }
    .line-key {
      border-top-color: CanvasText;
    }
  }
</style>
