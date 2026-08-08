<script lang="ts">
  import {
    SQUIRCLE_TICK_PATH,
    createSquirclePath,
  } from "../../lib/squircle.js";

  /**
   * Velvet's own tick, drawn inside its own shape.
   *
   * A status page says "all systems operational" with this rather than with a
   * borrowed circle, because the squircle is the shape Velvet is built from and
   * the one moment a reader looks hardest at the page is the moment it says
   * everything is fine.
   *
   * Drawn in two tones the way Phosphor's duotone weight is, so it sits beside
   * the other icons on the page rather than against them: the shape carries a
   * faint fill and the tick is drawn at full strength. Both take
   * `currentColor`, so whoever places it decides the colour.
   *
   * @param size - The width and height it spans, in CSS units.
   */
  let { size = "1em" }: { size?: string } = $props();

  /** Inset so the stroke stays inside the box the icon is given. */
  const OUTLINE = createSquirclePath(100, 5);
</script>

<svg
  class="squircle-check"
  viewBox="0 0 100 100"
  width={size}
  height={size}
  aria-hidden="true"
>
  <path d={OUTLINE} class="face" />
  <path
    d={OUTLINE}
    fill="none"
    stroke="currentColor"
    stroke-width="7"
    stroke-linejoin="round"
  />
  <path
    d={SQUIRCLE_TICK_PATH}
    fill="none"
    stroke="currentColor"
    stroke-width="9"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>

<style>
  .squircle-check {
    display: block;
  }
  /* The lighter of the two tones, at the opacity Phosphor's duotone weight
     uses, so this reads as one of the family rather than as a heavier mark. */
  .face {
    fill: currentColor;
    opacity: 0.2;
  }
</style>
