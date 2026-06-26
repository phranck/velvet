<script lang="ts">
  import type { DayStatus, ServiceSummary } from "../lib/types";
  import UptimeBar from "./UptimeBar.svelte";

  let {
    service,
    days,
    uptime,
    rangeLabel,
    icon,
  }: {
    service: ServiceSummary;
    days: DayStatus[];
    uptime: string;
    rangeLabel: string;
    icon: string;
  } = $props();

  let open = $state(false);

  const dotColor = $derived(
    service.status === "up"
      ? "var(--accent-bright)"
      : service.status === "degraded"
        ? "var(--accent-deg)"
        : "var(--accent-down)",
  );
  const statusLabel = $derived(
    service.status === "up" ? "Operational" : service.status === "degraded" ? "Degraded" : "Down",
  );
</script>

<div class="row">
  <button class="top" onclick={() => (open = !open)} aria-expanded={open}>
    <i class="ph-duotone {icon} svc-ico" style:color={dotColor} aria-hidden="true"></i>
    <span class="name">{service.name}</span>
    <span class="uptime mono">{uptime}</span>
    <i class="ph-bold {open ? 'ph-caret-up' : 'ph-caret-down'} chev" aria-hidden="true"></i>
  </button>

  <UptimeBar {days} {rangeLabel} />

  {#if open}
    <div class="detail">
      <span class="metric mono"><b>{statusLabel}</b></span>
      <span class="metric mono"><b>{service.time}</b> ms avg</span>
      <a class="metric link" href={service.url} target="_blank" rel="noreferrer">{service.url}</a>
    </div>
  {/if}
</div>

<style>
  .row {
    padding: 15px 18px;
    border-bottom: 1px solid var(--border-soft);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  .svc-ico {
    font-size: 22px;
    line-height: 1;
    flex: none;
  }
  .name {
    font-size: 16.5px;
    font-weight: 500;
    flex: 1;
    text-align: left;
  }
  .uptime {
    font-size: 14px;
    color: var(--text-muted);
  }
  .chev {
    font-size: 15px;
    color: var(--text-faint);
    margin-left: 12px;
  }
  .detail {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 13px;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    flex-wrap: wrap;
  }
  .metric {
    font-size: 14px;
    color: var(--text-muted);
  }
  .metric b {
    color: var(--text);
    font-weight: 600;
  }
  .link {
    color: var(--accent-bright);
  }
</style>
