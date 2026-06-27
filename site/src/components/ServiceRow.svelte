<script lang="ts">
  import type { DayStatus, RangeKey, ServiceStatus, ServiceSummary } from "../lib/types";
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
    service: ServiceSummary;
    days: DayStatus[];
    uptime: string;
    rangeLabel: string;
    range: RangeKey;
    icon: string;
    open: boolean;
    onToggle: () => void;
  } = $props();

  /** Status colour: bright accent when up, amber when degraded, red when down. */
  function statusColor(status: ServiceStatus): string {
    if (status === "up") return "var(--accent-bright)";
    if (status === "degraded") return "var(--accent-deg)";
    return "var(--accent-down)";
  }
  /** Human-readable status label. */
  function statusText(status: ServiceStatus): string {
    if (status === "up") return "Operational";
    if (status === "degraded") return "Degraded";
    return "Down";
  }
  const dotColor = $derived(statusColor(service.status));
  /** An IPv6-only service: a standalone `<x>-ipv6` check with no IPv4 base to fold into. */
  const isIpv6Only = $derived(!service.ipv6 && service.slug.endsWith("-ipv6"));
</script>

<div class="row">
  <button class="top" onclick={onToggle} aria-expanded={open}>
    <i class="ph-duotone {icon} svc-ico" style:color={dotColor} aria-hidden="true"></i>
    <span class="name">{service.name}</span>
    {#if service.ipv6}
      <span class="protos" aria-label="protocol reachability">
        <span class="proto" style:--c={statusColor(service.status)}>IPv4</span>
        <span class="proto" style:--c={statusColor(service.ipv6.status)}>IPv6</span>
      </span>
    {:else if isIpv6Only}
      <span class="protos" aria-label="protocol reachability">
        <span class="proto" style:--c={statusColor(service.status)}>IPv6</span>
      </span>
    {/if}
    <span class="uptime mono">{uptime}</span>
    <i class="ph-duotone ph-caret-down chev" class:open aria-hidden="true"></i>
  </button>

  <UptimeBar {days} {rangeLabel} {range} />

  <div class="detail-wrap" class:open>
    <div class="detail-clip">
      <div class="detail" inert={!open}>
        <div class="proto-detail">
          {#if service.ipv6}
            <span class="proto-tag" style:--c={statusColor(service.status)}>IPv4</span>
          {:else if isIpv6Only}
            <span class="proto-tag" style:--c={statusColor(service.status)}>IPv6</span>
          {/if}
          <span class="metric mono"><b>{statusText(service.status)}</b></span>
          <span class="metric mono"><b>{service.time}</b> ms{service.ipv6 ? "" : " avg"}</span>
          <a class="metric link" href={service.url} target="_blank" rel="noreferrer">{service.url}</a>
        </div>
        {#if service.ipv6}
          <div class="proto-detail">
            <span class="proto-tag" style:--c={statusColor(service.ipv6.status)}>IPv6</span>
            <span class="metric mono"><b>{statusText(service.ipv6.status)}</b></span>
            <span class="metric mono"><b>{service.ipv6.time}</b> ms</span>
            <a class="metric link" href={service.ipv6.url} target="_blank" rel="noreferrer"
              >{service.ipv6.url}</a
            >
          </div>
        {/if}
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
  .link {
    color: var(--accent-bright);
  }
</style>
