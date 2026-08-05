<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    active,
    labelledBy,
    children,
  }: {
    active: boolean;
    labelledBy: string;
    children: Snippet;
  } = $props();
</script>

<section
  class="body"
  class:active
  hidden={!active}
  aria-labelledby={labelledBy}
  data-step-card-body
>
  {@render children()}
</section>

<style>
  .body {
    min-height: 27rem;
    /* The fallback matches STEP_CARD_CONTENT_INSET, for a surface that renders
       this without setting the property. Both move together or a card on such
       a surface holds its content at a distance no longer used anywhere. */
    padding: var(--step-card-content-inset, 16px);
    box-sizing: border-box;
  }
  .body[hidden] {
    display: none;
  }
</style>
