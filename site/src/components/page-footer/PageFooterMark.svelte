<script lang="ts">
  import RainbowScale from "../RainbowScale.svelte";
  import VelvetWordmark from "../VelvetWordmark.svelte";

  /**
   * The mark, signed at the foot of a page.
   *
   * The same wordmark and scale the bar carries at the top, drawn quietly and
   * at the end rather than at the start. It says who made the page for a reader
   * who arrived part of the way down and scrolled to the bottom, which is where
   * the bar is no longer in view.
   *
   * Drawn from the two shared components rather than written out again, so the
   * nine colours, their order and their rounded ends exist in one place.
   *
   * Hidden from a screen reader, because the credit beside it already says the
   * same thing in words and the bar at the top of the page carries the mark as
   * a link somebody can actually use.
   */
</script>

<span class="mark" aria-hidden="true" data-page-footer-mark>
  <VelvetWordmark />
  <span class="scale">
    <RainbowScale />
  </span>
</span>

<style>
  /* The last column of the footer's grid, at its end, so the mark meets the
     right-hand edge of the page measure the way the credit meets the left. */
  .mark {
    grid-column: 3;
    justify-self: end;
    display: block;
    /* Sized by what it holds, so the scale beneath takes its width from the
       word above it and the two ends of the colours meet the two ends of the
       letters. */
    width: fit-content;
    color: var(--velvet-text-dim);
    font-size: 1.125rem;
  }
  /* The same proportion the bar draws it at: a thin rule under a small mark,
     against the five pixels the start page gives it under one four times the
     size. */
  .scale {
    display: block;
    height: 2px;
    margin-top: 0.375rem;
  }
</style>
