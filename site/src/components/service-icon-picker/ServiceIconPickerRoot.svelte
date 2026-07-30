<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    legend,
    description,
    children,
  }: {
    legend: string;
    description?: string;
    children: Snippet;
  } = $props();
</script>

<fieldset data-service-icon-picker>
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
    font-size: 0.9rem;
    font-weight: 700;
  }
  p {
    margin: 0.3rem 0 0.75rem;
    color: var(--picker-muted, #6f7280);
    font-size: 0.8rem;
    line-height: 1.4;
  }
  .options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(4.6rem, 1fr));
    gap: 0.48rem;
  }
</style>
