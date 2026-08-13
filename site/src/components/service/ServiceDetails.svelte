<script lang="ts">
  import { untrack } from "svelte";
  import { disclosure } from "@velvet/bundle-plugins/disclosure";
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
    monitoringStartedAt,
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
    monitoringStartedAt: string;
    open: boolean;
    id: string;
    chart: VelvetTheme["chart"];
  } = $props();

  /**
   * Whether the panel starts closed, read once and never again.
   *
   * The prerendered document carries no script, so without this every panel
   * would stand open in it until hydration closed them, and a reader without
   * JavaScript would never be able to close one.
   *
   * Read untracked deliberately. The action owns `hidden` and `inert` from the
   * moment it runs, and an attribute that followed `open` would remove a
   * closing panel from the layout before its animation had played, which is the
   * whole reason the action owns them.
   */
  const startsClosed = untrack(() => !open);
</script>

<div
  class="detail-wrap"
  {id}
  hidden={startsClosed}
  inert={startsClosed}
  use:disclosure={open}
>
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
      {monitoringStartedAt}
      {chart}
    />
  </div>
</div>

<style>
  /*
    Clipped at all times, not only whilst it animates.

    `overflow` other than `visible` gives this a formatting context of its own,
    which contains the panel's own top margin instead of letting it collapse
    through and act above the panel. That changes the height by exactly that
    margin, so a panel measured without the clip and animated with it arrives 13
    pixels short, and everything below it jumps by that much on the last frame.
    Clipping throughout makes the height before, during and after the same
    number.
  */
  .detail-wrap {
    overflow: hidden;
  }
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
