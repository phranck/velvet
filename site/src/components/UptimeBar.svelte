<script lang="ts">
  import type { DayStatus } from "../lib/types";

  let { days, rangeLabel }: { days: DayStatus[]; rangeLabel: string } = $props();

  function color(status: DayStatus["status"]): string {
    if (status === "up") return "var(--accent)";
    if (status === "degraded") return "var(--accent-deg)";
    return "var(--accent-down)";
  }

  function label(d: DayStatus): string {
    if (!d.hasData) return "no data";
    if (d.status === "up") return "operational";
    if (d.status === "degraded") return `degraded · ${d.minutesDown} min down`;
    return `down · ${d.minutesDown} min`;
  }

  function tip(d: DayStatus): string {
    const date = new Date(`${d.date}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${date} · ${label(d)}`;
  }
</script>

<div class="bar">
  {#each days as d (d.date)}
    <span class="seg" class:ghost={!d.hasData} style:--c={color(d.status)} data-tip={tip(d)}></span>
  {/each}
</div>
<div class="labels mono">
  <span>{rangeLabel}</span>
  <span>Today</span>
</div>

<style>
  .bar {
    display: flex;
    gap: 2px;
    height: 32px;
    margin-top: 11px;
  }
  .seg {
    position: relative;
    flex: 1 1 0;
    min-width: 2px;
    border-radius: 2px;
    background:
      linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.22) 0%,
        rgba(255, 255, 255, 0.05) 42%,
        rgba(0, 0, 0, 0.12) 100%
      ),
      var(--c);
    transition: transform 0.1s ease;
  }
  .seg.ghost {
    background: rgba(255, 255, 255, 0.05);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
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
    white-space: nowrap;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--surface-solid);
    border: 1px solid var(--border);
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
    border-top-color: var(--surface-solid);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease;
    z-index: 6;
  }
  .seg:hover::after,
  .seg:hover::before {
    opacity: 1;
  }
  .labels {
    display: flex;
    justify-content: space-between;
    margin-top: 7px;
    font-size: 13px;
    color: var(--text-faint);
  }
</style>
