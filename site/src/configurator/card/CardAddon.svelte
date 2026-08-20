<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * What acts on the card, at the end of the row it stands in.
   *
   * Held to the end by the space before it rather than by an order somebody
   * has to keep, so it lands there wherever it is written in the header.
   */
  let { children }: { children: Snippet } = $props();
</script>

<div class="card__addon">
  {@render children()}
</div>

<style>
  .card__addon {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 0 0 auto;
    margin-inline-start: auto;
  }
</style>
