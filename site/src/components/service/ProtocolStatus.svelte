<script lang="ts">
  import {
    protocolLabel,
    responseTimeText,
    statusColor,
    statusText,
  } from "../../lib/protocol";
  import type { ServiceCheck } from "../../lib/types";

  let { check }: { check: ServiceCheck } = $props();
</script>

<div class="protocol-status" role="listitem" style:--c={statusColor(check.status)}>
  <span class="protocol mono">{protocolLabel(check)}</span>
  <strong class="state mono">{statusText(check.status)}</strong>
  <span class="latency mono">{responseTimeText(check)}</span>
</div>

<style>
  .protocol-status {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 2px 0;
  }
  .protocol {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text);
    font-size: 12px;
    font-weight: 600;
  }
  .protocol::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--c);
  }
  .state {
    min-width: 0;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }
  .latency {
    color: var(--text-muted);
    font-size: 14px;
    white-space: nowrap;
  }

  @media (max-width: 440px) {
    .protocol-status {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 4px 12px;
    }
    .latency {
      grid-column: 2;
    }
  }
</style>
