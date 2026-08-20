<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The top of a card: what it is called, and what can be done to it.
   *
   * A row, so what it holds stands beside what else it holds. The heading
   * itself is the caller's, because what element that should be differs by
   * where the card stands: inside a dialog it has to be the dialog's own
   * title, which is what names the dialog for a screen reader, and a heading
   * of this component's choosing would be a second one.
   */
  let { children }: { children: Snippet } = $props();
</script>

<header class="card__header">
  {@render children()}
</header>

<style>
  .card__header {
    display: flex;
    align-items: center;
    gap: 1rem;
    /* The card's own inset, plus the text inset on the sides, where a line of
       type would otherwise sit against the corner's curve. */
    padding: var(--configurator-inset);
    padding-inline: calc(var(--configurator-inset) + var(--configurator-text-inset));
  }
</style>
