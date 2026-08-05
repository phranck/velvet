<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<footer class="form-actions" data-step-card-footer>
  {@render children()}
</footer>

<style>
  .form-actions {
    /* Held so the card keeps its height on a step whose footer is empty. The
       row sits at the bottom of it rather than in the middle, because centring
       puts half of any surplus under the buttons and they then stand further
       from the card's edge below than beside. */
    min-height: 4rem;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 1rem;
    padding: 0 var(--step-card-content-inset, 16px)
      var(--step-card-content-inset, 16px);
    box-sizing: border-box;
  }
</style>
