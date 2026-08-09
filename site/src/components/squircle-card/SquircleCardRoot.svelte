<script lang="ts">
  import type { Snippet } from "svelte";

  import {
    SQUIRCLE_CONTENT_INSET,
    SQUIRCLE_INNER_PATH_INSET,
    SQUIRCLE_INNER_STROKE_WIDTH,
    SQUIRCLE_OUTER_STROKE_WIDTH,
    createSquircleRectPath,
  } from "../../lib/squircle.js";

  /**
   * A card whose edge is Velvet's own shape rather than a rounded rectangle.
   *
   * The shape is stated in a square and stretched to whatever box the card ends
   * up being, so nothing has to measure the element first. That is what lets a
   * prerendered page use it, since such a page loads no script.
   *
   * The lines are rings cut with a mask, and that is the whole reason this
   * component exists rather than reaching for `SquircleFrame.Outline`.
   *
   * A stroke cannot carry this shape. Its width and its offset both live in the
   * path's own coordinates, so stretching a square shape onto a card twelve
   * hundred wide multiplies both by twelve: the thin line arrives twelve pixels
   * from the edge and the thick one sixty-six, drawn forty-eight wide.
   * `vector-effect="non-scaling-stroke"` does not rescue it, because it is not
   * honoured under a non-uniform stretch.
   *
   * A filled shape cannot carry it either. The card's surface is translucent,
   * so a line painted from the edge inwards shows through it across the whole
   * card and lifts the colour off the one a plain card has.
   *
   * A ring is the shape masked by a copy of itself, shrunk by twice the line's
   * width and taken away. Both the width and the offset are then pixels, whilst
   * the shape is free to stretch, and the surface is painted exactly once.
   *
   * The surface it carries comes from `--squircle-card-surface`, so a card
   * inside another can lift itself off the one behind it without this component
   * growing a variant for every place it is used.
   *
   * @param children - The card's content, ordinarily a {@link SquircleCardBody}.
   */
  let { children }: { children: Snippet } = $props();

  /** The square the shape is stated in before it is stretched. */
  const NORMALISED_SIDE = 100;
  /**
   * The shape, and the cut that gives the surface its edge.
   *
   * Unique per card, because a clip path is reached by id and two cards on one
   * page would otherwise share whichever definition rendered last. Applied with
   * `clipPathUnits="objectBoundingBox"`, so it fits the surface to its box.
   */
  /**
   * Where the thick line begins, measured from the card's edge.
   *
   * A stroke straddles its path, so it runs from half its width inside the
   * inset the path is drawn at. Taken from the same numbers a stroked frame
   * uses, so the two frames are the same frame.
   */
  const INNER_LINE_START =
    SQUIRCLE_INNER_PATH_INSET - SQUIRCLE_INNER_STROKE_WIDTH / 2;

  const instanceId = $props.id();
  const clipId = `velvet-squircle-card-${instanceId}`;
  const shape = createSquircleRectPath(NORMALISED_SIDE, NORMALISED_SIDE);
  const shapeTransform = `scale(${1 / NORMALISED_SIDE} ${1 / NORMALISED_SIDE})`;
  /**
   * The shape again, as an image a mask can be sized in pixels against.
   * `preserveAspectRatio="none"` is what lets one square stretch to the card.
   */
  const shapeImage =
    `url("data:image/svg+xml,` +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${NORMALISED_SIDE} ${NORMALISED_SIDE}" preserveAspectRatio="none"><path d="${shape}" fill="#fff"/></svg>`,
    ) +
    `")`;
</script>

<div
  class="root"
  data-squircle-card
  style={`--squircle-card-clip: url(#${clipId});
          --squircle-card-inner-line-start: ${INNER_LINE_START}px;
          --squircle-card-shape-image: ${shapeImage};
          --squircle-card-content-inset: ${SQUIRCLE_CONTENT_INSET}px`}
>
  <svg width="0" height="0" aria-hidden="true" focusable="false" class="shape">
    <defs>
      <clipPath id={clipId} clipPathUnits="objectBoundingBox">
        <path d={shape} transform={shapeTransform} />
      </clipPath>
    </defs>
  </svg>
  <!--
    The surface, then the two lines over it as rings. The gap between them shows
    the surface, because a ring paints only its own band.
  -->
  <div class="surface"></div>
  <div
    class="line"
    style={`inset: 0; --squircle-card-line-width: ${SQUIRCLE_OUTER_STROKE_WIDTH}px`}
  ></div>
  <div
    class="line"
    style={`inset: var(--squircle-card-inner-line-start); --squircle-card-line-width: ${SQUIRCLE_INNER_STROKE_WIDTH}px`}
  ></div>
  {@render children()}
</div>

<style>
  .root {
    position: relative;
    /* So the body fills the card rather than only its own content, which is
       what lets a card with a minimum height place its content within it. The
       surface and the two lines are out of flow, so this lays out the body
       alone. */
    display: grid;
    /* `rule` is the token for a line or an edge, and the frame is one, lifted
       a little off it so the shape reads on a dark card without announcing
       itself. */
    color: color-mix(in srgb, var(--velvet-rule), var(--velvet-text) 14%);
    /* The card's own shape casts it, which is why this is a filter rather than
       a box shadow: a box shadow would trace the rectangle the shape is cut
       from. Two layers, as `--velvet-card-shadow` states them, and a card
       inside another turns them down through this variable rather than by
       declaring a shadow of its own. */
    filter: drop-shadow(
        0 0.5rem 1rem rgb(0 0 0 / var(--squircle-card-shadow-strength, 0.4))
      )
      drop-shadow(
        0 1.25rem 3rem
          rgb(0 0 0 / calc(var(--squircle-card-shadow-strength, 0.4) * 1.125))
      );
  }
  .shape {
    position: absolute;
    width: 0;
    height: 0;
  }
  .surface {
    position: absolute;
    inset: 0;
    clip-path: var(--squircle-card-clip);
    background: var(--squircle-card-surface, var(--velvet-surface-card));
  }
  /*
    The shape, less a copy of itself shrunk by twice the line's width. What
    survives is a band of exactly that width, following the curve, with the
    surface showing through everywhere else.
  */
  .line {
    position: absolute;
    background: currentColor;
    mask-image: var(--squircle-card-shape-image), var(--squircle-card-shape-image);
    mask-size:
      100% 100%,
      calc(100% - 2 * var(--squircle-card-line-width))
        calc(100% - 2 * var(--squircle-card-line-width));
    mask-position: center, center;
    mask-repeat: no-repeat, no-repeat;
    mask-composite: subtract;
  }
</style>
