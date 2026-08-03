<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    legend,
    description,
    compact = false,
    children,
  }: {
    legend: string;
    description?: string;
    compact?: boolean;
    children: Snippet;
  } = $props();
</script>

<fieldset class:compact data-theme-card-group aria-label={legend}>
  <h3>{legend}</h3>
  {#if description}<p>{description}</p>{/if}
  <div class="options">
    {@render children()}
  </div>
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  h3 {
    padding: 0;
    margin: 0 var(--theme-card-text-inset, 0);
    color: var(--picker-text, currentColor);
    /* Falls back to Velvet's condensed face rather than to whatever the
       surrounding text is set in. Left to inherit, this heading rendered in the
       body face on any surface that did not name one, which is every heading in
       the product except this one. */
    font-family: var(--theme-card-heading-font, var(--velvet-font-heading));
    font-size: var(--theme-card-heading-font-size, 1.25rem);
    font-weight: 700;
  }
  p {
    margin: 0.35rem var(--theme-card-text-inset, 0) 1rem;
    color: var(--picker-muted, #6f7280);
    font-size: var(--theme-card-description-font-size, 0.875rem);
    line-height: 1.45;
  }
  .options {
    display: grid;
    grid-template-columns: var(
      --theme-card-columns,
      repeat(2, minmax(0, 1fr))
    );
    gap: var(--theme-card-gap, 0.8rem);
  }
  .compact .options {
    gap: 0.55rem;
  }

  @media (max-width: 560px) {
    .options {
      grid-template-columns: 1fr;
    }
  }
</style>
