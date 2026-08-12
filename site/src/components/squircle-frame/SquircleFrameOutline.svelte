<script lang="ts">
  import {
    SQUIRCLE_INNER_PATH_INSET,
    SQUIRCLE_INNER_STROKE_WIDTH,
    SQUIRCLE_OUTER_PATH_INSET,
    SQUIRCLE_OUTER_STROKE_WIDTH,
    createSquircleRectPath,
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
   * @param width - The width the frame spans, in pixels. Optional: a caller
   *   that cannot measure its element leaves both out and gets the normalised
   *   frame instead, which is drawn in a square and stretched to whatever box
   *   it is placed in, with the two lines held to the widths declared here. A
   *   page that ships prerendered and loads no script has nothing to measure
   *   with, so that is the form it takes.
   * @param height - The height it spans. Given together with the width, the
   *   path is computed at the size it is drawn at rather than scaled by the
   *   browser, which is what keeps the stroke even. Keep the two within reach of
   *   each other: the further a squircle is from square, the more it reads as a
   *   capsule.
   * @param filled - Whether the shape carries an opaque fill in its own outline.
   *   A surface over artwork needs one, since the shape is not a background the
   *   element itself can hold.
   */
  let {
    width,
    height,
    filled = false,
  }: { width?: number; height?: number; filled?: boolean } = $props();

  /** The square the normalised frame is drawn in before it is stretched. */
  const NORMALISED_SIDE = 100;
  const measured = $derived(width !== undefined && height !== undefined);
  const boxWidth = $derived(measured ? width! : NORMALISED_SIDE);
  const boxHeight = $derived(measured ? height! : NORMALISED_SIDE);
  const outerPath = $derived(
    createSquircleRectPath(boxWidth, boxHeight, SQUIRCLE_OUTER_PATH_INSET),
  );
  const innerPath = $derived(
    createSquircleRectPath(boxWidth, boxHeight, SQUIRCLE_INNER_PATH_INSET),
  );
</script>

<svg
  class="outline"
  data-squircle-frame
  data-squircle-normalised={measured ? undefined : ""}
  viewBox={`0 0 ${Math.max(boxWidth, 1)} ${Math.max(boxHeight, 1)}`}
  preserveAspectRatio={measured ? undefined : "none"}
  aria-hidden="true"
  {...{ "pointer-events": "none" }}
>
  {#if filled}
    <path d={outerPath} class="fill" stroke="none"></path>
  {/if}
  <!--
    Both lines keep their stated width whatever size the frame is drawn at.

    Without this the width is multiplied by however far the viewBox was scaled
    to reach the element, so the same frame drew a 0.82px line around a picture
    470 wide and a 1.02px line around one 587 wide. Two frames on one page, at
    two weights, from one component.

    `non-scaling-stroke` is honoured under a uniform scale, which is what the
    measured form has: the box is stated at the ratio it is drawn at, so both
    axes are scaled by the same factor.
  -->
  <path
    d={outerPath}
    fill="none"
    stroke="currentColor"
    stroke-width={SQUIRCLE_OUTER_STROKE_WIDTH}
    stroke-linejoin="round"
    vector-effect="non-scaling-stroke"
  ></path>
  <path
    d={innerPath}
    fill="none"
    stroke="currentColor"
    stroke-width={SQUIRCLE_INNER_STROKE_WIDTH}
    stroke-linejoin="round"
    vector-effect="non-scaling-stroke"
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
