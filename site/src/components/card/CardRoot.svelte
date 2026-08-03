<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The surface everything on velvet.li sits on.
   *
   * One component rather than one per page. The four pages each wrote their own
   * before, repeating the same colour, radius, and padding, and each adding a
   * border the start page's cards do not have. That is how the site came to
   * show two kinds of card, and it is what a reader saw first.
   *
   * The geometry comes from the tokens in `website.css`, so the shape is stated
   * once and a change to it reaches every card. Nothing here takes a size, a
   * colour, or a variant: a card that needs to look different is a different
   * component, not a flag on this one.
   */
  let {
    children,
    element = $bindable(undefined),
  }: {
    children: Snippet;
    /**
     * The rendered element, for a page that has to measure or observe it.
     * Nothing needs it yet; it exists so that wanting it is not a reason to
     * write a fifth card.
     */
    element?: HTMLDivElement;
  } = $props();
</script>

<div class="card" bind:this={element}>
  {@render children()}
</div>

<style>
  /* No border. The surface is what separates the card from the backdrop, and a
     rule around it drew a second edge just inside the first, which is why the
     start page's cards never had one. */
  .card {
    /* The notes component takes its colour from this, and falls back to what it
       inherits where a surface states none. Every card on the site is a reading
       surface, so it states the reading colour. */
    --tool-text: var(--velvet-text);
    background: #14161d;
    border-radius: var(--velvet-card-radius);
    padding: var(--velvet-card-padding);
    font-size: var(--velvet-text-body);
    line-height: 1.7;
  }
</style>
