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

<fieldset class:compact data-theme-card-group>
  <legend>{legend}</legend>
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
  legend {
    padding: 0;
    color: var(--picker-text, currentColor);
    font-size: 1rem;
    font-weight: 700;
  }
  p {
    margin: 0.35rem 0 1rem;
    color: var(--picker-muted, #6f7280);
    font-size: 0.875rem;
    line-height: 1.45;
  }
  .options {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
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
