<script lang="ts">
  import type { RangeKey, ResponseTimesDocument } from "../../lib/types";
  import { RANGE_LABEL } from "../../lib/data";
  import {
    downsampleResponseSamples,
    filterResponseSeries,
    monotonePath,
    responseRangeWindow,
  } from "../../lib/response-chart";
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
  }: {
    serviceId: string;
    serviceName: string;
    series: ResponseSeries;
    range: RangeKey;
    generatedAt: string;
  } = $props();

  const WIDTH = 640;
  const HEIGHT = 148;
  const PLOT_LEFT = 12;
  const PLOT_RIGHT = 628;
  const PLOT_TOP = 12;
  const PLOT_BOTTOM = 116;
  const MAX_POINTS = 96;

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
    const { start, end } = responseRangeWindow(range, generatedAt);
    const x =
      PLOT_LEFT +
      ((Date.parse(sample.timestamp) - start) / (end - start)) *
        (PLOT_RIGHT - PLOT_LEFT);
    const y =
      PLOT_BOTTOM -
      (sample.responseTimeMs / maximumResponse) *
        (PLOT_BOTTOM - PLOT_TOP);
    return { x, y };
  }

  function pathFor(samples: AvailableSample[]): string {
    return monotonePath(samples.map(coordinates));
  }

  function lineStyle(protocol: "ipv4" | "ipv6"): "solid" | "dashed" {
    return protocol === "ipv4" ? "solid" : "dashed";
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
      href={`#${summaryId}`}
      aria-label={`Response time chart for ${serviceName}`}
      aria-describedby={summaryId}
    >
      <svg
        class="plot"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title>Response time history for {serviceName}</title>
        <desc id={descriptionId}>{description}</desc>
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
          {#each segments as segment}
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
              <path
                class="series-line"
                data-protocol={entry.protocol}
                data-line-style={lineStyle(entry.protocol)}
                d={pathFor(segment)}
              ></path>
            {/if}
          {/each}
        {/each}
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
  .series-point {
    stroke: var(--series-color);
    vector-effect: non-scaling-stroke;
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
