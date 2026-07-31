<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<footer class="form-actions" data-step-card-footer>
  {@render children()}
</footer>

<style>
  .form-actions {
    min-height: 4rem;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1rem;
    padding: 0 var(--step-card-content-inset, 20px)
      var(--step-card-content-inset, 20px);
    box-sizing: border-box;
  }
</style>
