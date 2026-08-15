<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The surface the configurator puts things on.
   *
   * Its own component rather than the one in `src/components/card`, which is
   * velvet.li's and is drawn from that page's tokens. This surface answers to
   * the configurator's own, which are dark throughout and neutral where the
   * others run warm.
   *
   * Composed rather than configured: a header, an add-on beside it, a body and
   * a footer, each of them optional and each brought by the caller. That is
   * what keeps a card from growing a flag every time somebody wants one
   * without a footer.
   *
   * Nothing here takes a size, a colour or a variant. A card that has to look
   * different is a different component.
   */
  let {
    children,
    element = $bindable(undefined),
  }: {
    children: Snippet;
    /** The rendered element, for anything that has to measure or observe it. */
    element?: HTMLDivElement;
  } = $props();
</script>

<div class="card" bind:this={element}>
  {@render children()}
</div>

<style>
  /* A column, so a body between a header and a footer takes what is left and
     scrolls inside itself rather than pushing the footer out of the card. */
  .card {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    border: 1px solid var(--configurator-divider);
    border-radius: var(--configurator-radius);
    background: var(--configurator-base);
    color: var(--configurator-text);
    overflow: hidden;
  }
</style>
