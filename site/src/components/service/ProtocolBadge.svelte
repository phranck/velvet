<script lang="ts">
  import { protocolLabel, statusColor, statusText } from "../../lib/protocol";
  import type { ServiceCheck } from "../../lib/types";

  let { check }: { check: ServiceCheck } = $props();
</script>

<span class="protocol-badge" style:--c={statusColor(check.status)}>
  {protocolLabel(check)}
  <span class="visually-hidden"> {statusText(check.status)}</span>
</span>

<style>
  .protocol-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px 2px 7px;
    border: 1px solid var(--proto-border);
    border-radius: 999px;
    background: var(--proto-bg);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--proto-size);
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .protocol-badge::before {
    content: "";
    width: var(--proto-dot);
    height: var(--proto-dot);
    border-radius: 50%;
    background: var(--c);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
