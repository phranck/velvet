<script lang="ts">
  import { disclosure } from "../../lib/disclosure";
  import type {
    RangeKey,
    ResponseTimesDocument,
    ServiceCheck,
  } from "../../lib/types";
  import type { VelvetTheme } from "../../lib/config";
  import ProtocolStatus from "./ProtocolStatus.svelte";
  import ResponseTimeChart from "./ResponseTimeChart.svelte";

  let {
    serviceId,
    serviceName,
    checks,
    responseSeries,
    range,
    generatedAt,
    open,
    id,
    chart,
  }: {
    serviceId: string;
    serviceName: string;
    checks: ServiceCheck[];
    responseSeries: ResponseTimesDocument["series"];
    range: RangeKey;
    generatedAt: string;
    open: boolean;
    id: string;
    chart: VelvetTheme["chart"];
  } = $props();
</script>

<div class="detail-wrap" {id} use:disclosure={open}>
  <div class="detail">
    <div class="protocol-grid" role="list" aria-label="Protocol status">
      {#each checks as check, index (check.id)}
        {#if index > 0}
          <span class="protocol-separator" aria-hidden="true">|</span>
        {/if}
        <ProtocolStatus {check} />
      {/each}
    </div>
    <ResponseTimeChart
      {serviceId}
      {serviceName}
      series={responseSeries}
      {range}
      {generatedAt}
      {chart}
    />
  </div>
</div>

<style>
  .detail {
    margin-top: 13px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
  }
  .protocol-grid {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(8px, 2vw, 18px);
  }
  .protocol-separator {
    flex: none;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: 14px;
    line-height: 1;
  }
</style>
