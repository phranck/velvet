<script lang="ts">
  import RainbowScale from "./RainbowScale.svelte";
  import VelvetWordmark from "./VelvetWordmark.svelte";

  let { subtitle }: { subtitle: string } = $props();

  const subtitleLetters = $derived(subtitle.toUpperCase().split(""));
</script>

<h1
  class="velvet-tool-brand"
  data-velvet-tool-brand
  aria-label={`Velvet ${subtitle}`}
>
  <VelvetWordmark />
  <div
    class="velvet-tool-palette"
    data-velvet-tool-palette
    aria-hidden="true"
  >
    <RainbowScale />
  </div>
  <!--
    No aria-label here. The heading above already carries the full name, and an
    aria-label replaces an element's contents for assistive technology, so
    repeating it would add nothing. It was also being ignored, because the
    attribute is prohibited on a span that carries no role, which failed both
    the ARIA and the accessibility-tree audits.
  -->
  <span class="velvet-tool-subtitle" data-velvet-tool-subtitle>
    {#each subtitleLetters as letter, index (index)}
      <span aria-hidden="true">{letter}</span>
    {/each}
  </span>
</h1>

<style>
  .velvet-tool-brand {
    --velvet-wordmark-display: block;
    --velvet-wordmark-size: var(--tool-brand-wordmark-size, 1em);
    --velvet-wordmark-text-align: center;
    --velvet-wordmark-width: 100%;

    width: var(--tool-brand-width, 100%);
    display: grid;
    justify-items: stretch;
    margin: 0;
    color: var(--tool-brand-accent, currentColor);
  }
  .velvet-tool-palette,
  .velvet-tool-subtitle {
    width: var(--tool-brand-inner-width, 94%);
    justify-self: center;
  }
  .velvet-tool-palette {
    height: var(--tool-brand-scale-height, 5px);
    margin-top: var(--tool-brand-scale-gap, 0.625rem);
  }
  .velvet-tool-subtitle {
    display: flex;
    justify-content: space-between;
    margin-top: var(--tool-brand-subtitle-gap, 0.9rem);
    color: var(--tool-brand-text, currentColor);
    font-family: var(--tool-brand-heading-font, inherit);
    font-size: var(--tool-brand-subtitle-size, 1rem);
    font-weight: 600;
    letter-spacing: 0;
    line-height: 1;
  }
</style>
