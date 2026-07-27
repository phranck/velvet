<script lang="ts">
  import type { ServiceCheck } from "../../lib/types";
  import ProtocolStatus from "./ProtocolStatus.svelte";

  let {
    checks,
    open,
    id,
  }: { checks: ServiceCheck[]; open: boolean; id: string } = $props();
</script>

<div class="detail-wrap" class:open>
  <div class="detail-clip">
    <div class="detail" {id} inert={!open}>
      <div class="protocol-grid" role="list" aria-label="Protocol status">
        {#each checks as check (check.id)}
          <ProtocolStatus {check} />
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
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
    margin-top: 13px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-2);
  }
  .protocol-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
    gap: 10px 24px;
  }
</style>
