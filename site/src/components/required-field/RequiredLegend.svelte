<script lang="ts">
  import RequiredMark from "./RequiredMark.svelte";

  /**
   * Explains the mark, once per card that uses it.
   *
   * Worded here rather than at each call site, so the two steps that carry
   * required fields cannot end up explaining the same mark differently. It
   * belongs below the fields it describes: a reader meets the marks first and
   * looks for their meaning afterwards.
   */
</script>

<p class="required-legend" data-required-legend>
  <RequiredMark />
  <span>Fields marked this way are needed before you can continue.</span>
</p>

<style>
  .required-legend {
    display: flex;
    align-items: baseline;
    gap: 0.15rem;
    margin: 1.25rem 1rem 0;
    color: var(--required-legend-color, currentColor);
    font-size: var(--required-legend-size, 0.8125rem);
    line-height: 1.45;
  }
</style>
