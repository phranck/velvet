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
    padding: 0.55rem clamp(1.25rem, 4vw, 2.4rem);
    box-sizing: border-box;
  }
</style>
