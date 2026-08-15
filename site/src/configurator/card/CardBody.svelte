<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * What the card holds, which is the part that scrolls.
   *
   * The card is a column and this is the piece that takes what is left, so a
   * body longer than the card scrolls inside it and the header and the footer
   * stay where they are.
   */
  let { children }: { children: Snippet } = $props();
</script>

<div class="card__body">
  {@render children()}
</div>

<style>
  .card__body {
    flex: 1;
    min-height: 0;
    padding: var(--configurator-inset);
    padding-top: 0;
    overflow-y: auto;
  }
</style>
