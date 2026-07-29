<script lang="ts">
  import type { DayStatus, RangeKey } from "../lib/types";

  let {
    days,
    rangeLabel,
    range,
  }: { days: DayStatus[]; rangeLabel: string; range: RangeKey } = $props();

  function color(day: DayStatus): string {
    if (day.status === "operational" && day.maintenance.length > 0) {
      return "var(--grid-maintenance)";
    }
    if (day.status === "operational") return "var(--grid-operational)";
    if (day.status === "unknown") return "var(--grid-no-data)";
    if (day.status === "degraded") return "var(--grid-degraded)";
    return "var(--grid-outage)";
  }

  function label(d: DayStatus): string {
    if (!d.hasData) return "no data";
    if (d.status === "operational") return "operational";
    if (d.status === "unknown") return "status unknown";
    if (d.status === "degraded") return `degraded · ${d.minutesDown} min down`;
    return `outage · ${d.minutesDown} min`;
  }

  function fmtShort(d: Date): string {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function maintenanceLabel(d: DayStatus): string {
    return d.maintenance
      .map((event) => {
        const startsAt = new Date(event.startsAt).toLocaleString();
        const endsAt = new Date(event.endsAt).toLocaleString();
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
        `${fmtShort(start)} – ${fmtShort(end)}`,
        label(d),
        maintenanceLabel(d),
      ]
        .filter(Boolean)
        .join("\n");
    }
    const full = end.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return [full, label(d), maintenanceLabel(d)].filter(Boolean).join("\n");
  }
</script>

<div class="bar" class:rounded={range === "quarter"}>
  {#each days as d (d.date)}
    <span
      class="seg"
      class:ghost={!d.hasData && d.maintenance.length === 0}
      class:maintenance={d.maintenance.length > 0}
      style:--c={color(d)}
      data-maintenance={d.maintenance.length > 0 ? "true" : undefined}
      data-tip={tip(d)}
      role={d.maintenance.length > 0 ? "img" : undefined}
      aria-label={d.maintenance.length > 0 ? tip(d) : undefined}
    ></span>
  {/each}
</div>
<div class="labels mono">
  <span>{rangeLabel}</span>
  <span>Today</span>
</div>

<style>
  .bar {
    display: flex;
    gap: var(--bar-gap);
    height: var(--bar-height);
    margin-top: 11px;
  }
  .bar.rounded .seg {
    border-radius: var(--bar-radius-full);
  }
  .seg {
    position: relative;
    flex: 1 1 0;
    min-width: 2px;
    border-radius: var(--bar-radius);
    background: var(--seg-gloss), var(--c);
    transition: transform 0.1s ease;
  }
  .seg.ghost {
    background: var(--grid-no-data);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text-tertiary) 14%, transparent);
  }
  .seg.maintenance {
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--grid-maintenance) 72%, var(--text-primary));
  }
  .seg:hover {
    transform: scaleY(1.12);
  }
  .seg::after {
    content: attr(data-tip);
    position: absolute;
    left: 50%;
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
    font-family: var(--font-mono);
    font-size: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
    z-index: 5;
  }
  .seg::before {
    content: "";
    position: absolute;
    left: 50%;
    bottom: calc(100% + 3px);
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--popover-bg);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
    z-index: 6;
  }
  .seg:hover::after,
  .seg:hover::before {
    opacity: 1;
  }
  @media (max-width: 440px) {
    .bar {
      position: relative;
      gap: 1px;
    }
    .seg {
      position: static;
    }
    .seg::before {
      display: none;
    }
  }
  .labels {
    display: flex;
    justify-content: space-between;
    margin-top: 7px;
    font-size: var(--labels-size);
    color: var(--text-faint);
  }
</style>
