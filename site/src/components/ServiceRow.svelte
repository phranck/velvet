<script lang="ts">
  import type {
    DayStatus,
    RangeKey,
    Service,
    ServiceCheck,
    ServiceStatus,
  } from "../lib/types";
  import UptimeBar from "./UptimeBar.svelte";

  let {
    service,
    days,
    uptime,
    rangeLabel,
    range,
    icon,
    open,
    onToggle,
  }: {
    service: Service;
    days: DayStatus[];
    uptime: string;
    rangeLabel: string;
    range: RangeKey;
    icon: string;
    open: boolean;
    onToggle: () => void;
  } = $props();

  /** Status colour: bright accent when operational, amber when degraded, red on outage. */
  function statusColor(status: ServiceStatus): string {
    if (status === "operational") return "var(--accent-bright)";
    if (status === "unknown") return "var(--text-muted)";
    if (status === "degraded") return "var(--accent-deg)";
    return "var(--accent-down)";
  }
  /** Human-readable status label. */
  function statusText(status: ServiceStatus): string {
    if (status === "operational") return "Operational";
    if (status === "unknown") return "Unknown";
    if (status === "degraded") return "Degraded";
    return "Outage";
  }
  function responseTime(check: ServiceCheck): string {
    return check.responseTimeMs === null
      ? "No data"
      : `${Math.round(check.responseTimeMs)} ms`;
  }
  const dotColor = $derived(statusColor(service.status));
</script>

<div class="row">
  <button class="top" onclick={onToggle} aria-expanded={open}>
    <i class="ph-duotone {icon} svc-ico" style:color={dotColor} aria-hidden="true"></i>
    <span class="name">{service.name}</span>
    {#if service.checks.length > 1 || service.checks[0]?.protocol === "ipv6"}
      <span class="protos" aria-label="protocol reachability">
        {#each service.checks as check (check.id)}
          <span class="proto" style:--c={statusColor(check.status)}
            >{check.protocol.toUpperCase()}</span
          >
        {/each}
      </span>
    {/if}
    <span class="uptime mono">{uptime}</span>
    <i class="ph-duotone ph-caret-down chev" class:open aria-hidden="true"></i>
  </button>

  <UptimeBar {days} {rangeLabel} {range} />

  <div class="detail-wrap" class:open>
    <div class="detail-clip">
      <div class="detail" inert={!open}>
        {#each service.checks as check (check.id)}
          <div class="proto-detail">
            <span class="proto-tag" style:--c={statusColor(check.status)}
              >{check.protocol.toUpperCase()}</span
            >
            <span class="metric mono"><b>{statusText(check.status)}</b></span>
            <span class="metric mono"><b>{responseTime(check)}</b></span>
          </div>
        {/each}
      </div>
    </div>
  </div>
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
    font-size: var(--svc-icon-size);
    line-height: 1;
    flex: none;
  }
  .name {
    font-size: var(--svc-name-size);
    font-weight: 500;
    flex: 1;
    text-align: left;
  }
  .uptime {
    font-size: var(--uptime-size);
    color: var(--text-muted);
  }
  .chev {
    font-size: 17px;
    color: var(--text-muted);
    margin-left: 12px;
    transition:
      color 0.12s ease,
      transform 0.18s ease;
  }
  .chev.open {
    transform: rotate(180deg);
  }
  .top:hover .chev {
    color: var(--accent-bright);
  }
  .protos {
    display: inline-flex;
    gap: 5px;
    margin-right: 10px;
    flex: none;
  }
  .proto {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-mono);
    font-size: var(--proto-size);
    font-weight: 600;
    letter-spacing: 0.3px;
    color: var(--text-muted);
    padding: 2px 8px 2px 7px;
    background: var(--proto-bg);
    border: 1px solid var(--proto-border);
    border-radius: 999px;
  }
  .proto::before {
    content: "";
    width: var(--proto-dot);
    height: var(--proto-dot);
    border-radius: 50%;
    background: var(--c);
  }
  /* The open/closed height snaps instantly here (no transition); App.svelte's FLIP
     animates the resulting position shift on the GPU via transform, so nothing
     relayouts mid-animation. Animating grid-template-rows itself drops frames. */
  .detail-wrap {
    display: grid;
    grid-template-rows: 0fr;
  }
  .detail-wrap.open {
    grid-template-rows: 1fr;
  }
  .detail-clip {
    overflow: hidden;
    min-height: 0;
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 13px;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .proto-detail {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .proto-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    min-width: 42px;
  }
  .proto-tag::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
  }
  .metric {
    font-size: 14px;
    color: var(--text-muted);
  }
  .metric b {
    color: var(--text);
    font-weight: 600;
  }
</style>
