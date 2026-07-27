<script lang="ts">
  import { statusColor } from "../../lib/protocol";
  import type { Service } from "../../lib/types";
  import ProtocolBadge from "./ProtocolBadge.svelte";

  let {
    service,
    icon,
    uptime,
    open,
    detailsId,
    onToggle,
  }: {
    service: Service;
    icon: string;
    uptime: string;
    open: boolean;
    detailsId: string;
    onToggle: () => void;
  } = $props();

  const dotColor = $derived(statusColor(service.status));
</script>

<button
  class="summary"
  onclick={onToggle}
  aria-expanded={open}
  aria-controls={detailsId}
>
  <i class="ph-duotone {icon} service-icon" style:color={dotColor} aria-hidden="true"></i>
  <span class="name">{service.name}</span>
  {#if service.checks.length > 1 || service.checks[0]?.protocol === "ipv6"}
    <span class="protocols" aria-label="Protocol reachability">
      {#each service.checks as check (check.id)}
        <ProtocolBadge {check} />
      {/each}
    </span>
  {/if}
  <span class="uptime mono">{uptime}</span>
  <i class="ph-duotone ph-caret-down chevron" class:open aria-hidden="true"></i>
</button>

<style>
  .summary {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  .summary:focus-visible {
    outline: 2px solid var(--accent-bright);
    outline-offset: 6px;
    border-radius: 4px;
  }
  .service-icon {
    flex: none;
    font-size: var(--svc-icon-size);
    line-height: 1;
  }
  .name {
    flex: 1;
    min-width: 0;
    text-align: left;
    overflow-wrap: anywhere;
    font-size: var(--svc-name-size);
    font-weight: 500;
  }
  .protocols {
    display: inline-flex;
    flex: none;
    gap: 5px;
    margin-right: 10px;
  }
  .uptime {
    color: var(--text-muted);
    font-size: var(--uptime-size);
  }
  .chevron {
    margin-left: 12px;
    color: var(--text-muted);
    font-size: 17px;
    transition:
      color 0.12s ease,
      transform 0.18s ease;
  }
  .chevron.open {
    transform: rotate(180deg);
  }
  .summary:hover .chevron {
    color: var(--accent-bright);
  }

  @media (max-width: 560px) {
    .summary {
      gap: 8px;
    }
    .protocols {
      display: none;
    }
    .chevron {
      margin-left: 4px;
    }
  }
</style>
