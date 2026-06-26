<script lang="ts">
  import type { DayStatus } from "../lib/types";

  let { days, rangeLabel }: { days: DayStatus[]; rangeLabel: string } = $props();

  function color(status: DayStatus["status"]): string {
    if (status === "up") return "var(--accent)";
    if (status === "degraded") return "var(--accent-deg)";
    return "var(--accent-down)";
  }
</script>

<div class="bar">
  {#each days as d (d.date)}
    <span
      class="seg"
      style:--c={color(d.status)}
      title={`${d.date} — ${d.status}${d.minutesDown ? ` (${d.minutesDown} min down)` : ""}`}
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
    gap: 2px;
    height: 32px;
    margin-top: 11px;
  }
  .seg {
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
  .seg:hover {
    transform: scaleY(1.09);
  }
  .labels {
    display: flex;
    justify-content: space-between;
    margin-top: 7px;
    font-size: 13px;
    color: var(--text-faint);
  }
</style>
