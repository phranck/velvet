<script lang="ts">
  import {
    SQUIRCLE_INNER_PATH_INSET,
    SQUIRCLE_INNER_STROKE_WIDTH,
    SQUIRCLE_OUTER_PATH_INSET,
    SQUIRCLE_OUTER_STROKE_WIDTH,
    createSquirclePath,
  } from "../../lib/squircle.js";

  /**
   * The two outlines that make a Velvet surface a Velvet surface.
   *
   * A thin line at the edge and a thick one just inside it, both drawn as
   * squircle paths rather than as borders, because a squircle is not a
   * border-radius and no amount of `border-radius` will produce one.
   *
   * The same shape appeared in the onboarding's steps and the theme cards with
   * the same four numbers written out in both, and a third copy was about to be
   * added for the references gallery. It is one shape, so it is one component,
   * and the insets live beside the path that uses them.
   *
   * Colour comes from `currentColor`, so whoever places this decides it and can
   * change it on hover or on selection without this knowing about either.
   *
   * @param size - The width and height the frame spans, in pixels. The caller
   *   measures its own element and passes it, because the path is computed at
   *   the size it is drawn at rather than scaled by the browser, which is what
   *   keeps the stroke even. The shape is square: a squircle stretched to a
   *   rectangle stops being one and reads as a capsule.
   * @param filled - Whether the shape carries an opaque fill in its own outline.
   *   A surface over artwork needs one, since the shape is not a background the
   *   element itself can hold.
   */
  let { size, filled = false }: { size: number; filled?: boolean } = $props();

  const outerPath = $derived(createSquirclePath(size, SQUIRCLE_OUTER_PATH_INSET));
  const innerPath = $derived(createSquirclePath(size, SQUIRCLE_INNER_PATH_INSET));
</script>

<svg
  class="outline"
  data-squircle-frame
  viewBox={`0 0 ${Math.max(size, 1)} ${Math.max(size, 1)}`}
  aria-hidden="true"
>
  {#if filled}
    <path d={outerPath} class="fill" stroke="none"></path>
  {/if}
  <path
    d={outerPath}
    fill="none"
    stroke="currentColor"
    stroke-width={SQUIRCLE_OUTER_STROKE_WIDTH}
    stroke-linejoin="round"
  ></path>
  <path
    d={innerPath}
    fill="none"
    stroke="currentColor"
    stroke-width={SQUIRCLE_INNER_STROKE_WIDTH}
    stroke-linejoin="round"
  ></path>
</svg>

<style>
  .outline {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .fill {
    fill: var(--squircle-frame-fill, transparent);
  }
</style>
