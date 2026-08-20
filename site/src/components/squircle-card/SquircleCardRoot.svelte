<script lang="ts">
  import type { Snippet } from "svelte";

  import {
    SQUIRCLE_CONTENT_INSET,
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
    The surface, and one hairline over it as a ring.

    One line rather than two. The double outline is Velvet's own device and the
    design keeps it for a single place, the screenshot the start page opens
    with; a card and a picture tile each carry a single hairline, and drawing
    the pair on everything made every surface shout the same thing.
  -->
  <div class="surface"></div>
  <!--
    The wall of the cut, in two rings: the lip at the top of it and the wall
    below, which is the same edge a little further down and a little less lit.
    The same two the pictures further down the page are drawn with, from the
    same values, so a card and a tile are cut to one depth.
  -->
  <div class="line lip"></div>
  <div class="line wall"></div>
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
    /*
      What lifts it off the page.

      Two layers rather than one, because a single wide shadow dissolves into
      the surface and leaves a card looking pasted flat: the near one draws its
      edge and the far one carries the height. Both fall away from the light
      rather than straight down, so the card and its own edge agree about where
      that light stands.

      A filter rather than a box shadow, because a box shadow traces the
      rectangle the shape is cut from rather than the shape.

      Both layers follow from how far the shadow reaches, which is stated once.
      Six numbers kept in step by hand would drift the first time one of them
      moved, and the two layers only read as one shadow whilst they agree about
      where the light stands.
    */
    --shadow-reach: 0.375rem;
    filter: drop-shadow(
        var(--shadow-reach) calc(var(--shadow-reach) * 1.25)
          calc(var(--shadow-reach) * 2.5)
          rgb(0 0 0 / var(--squircle-card-shadow-strength, 0.45))
      )
      drop-shadow(
        calc(var(--shadow-reach) * 2.5) calc(var(--shadow-reach) * 3)
          calc(var(--shadow-reach) * 7)
          rgb(0 0 0 / calc(var(--squircle-card-shadow-strength, 0.45) * 1.1))
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

    A ring rather than a border, because a border is painted outside the padding
    box and `clip-path` cuts the element afterwards, which loses the edge along
    every curve.

    The band carries the light rather than a colour, in the order a raised edge
    takes it: lit on the face turned towards the light and shaded on the face
    turned away. It is the same pair of tones and the same angle the recessed
    pictures further down the page are drawn between, in the opposite order,
    because a raised edge and a sunken one are one lighting model seen from two
    sides.
  */
  .line {
    position: absolute;
    mask-image: var(--squircle-card-shape-image), var(--squircle-card-shape-image);
    mask-size:
      100% 100%,
      calc(100% - 2 * var(--squircle-card-line-width))
        calc(100% - 2 * var(--squircle-card-line-width));
    mask-position: center, center;
    mask-repeat: no-repeat, no-repeat;
    mask-composite: subtract;
  }
  .lip {
    inset: 0;
    background: linear-gradient(
      var(--velvet-light-angle, 140deg),
      var(--velvet-edge-light, #4f4841) 0%,
      var(--velvet-surface-raised) 46%,
      var(--velvet-edge-shadow, #030303) 100%
    );

    --squircle-card-line-width: var(--velvet-edge-lip, 2px);
  }
  /* Below the lip, dimmed by the same share the pictures use, so an edge of the
     same depth turns away at the same rate wherever it is drawn. */
  .wall {
    inset: var(--velvet-edge-lip, 2px);
    background: linear-gradient(
      var(--velvet-light-angle, 140deg),
      color-mix(
          in srgb,
          var(--velvet-edge-light, #4f4841) var(--velvet-edge-inner-dim, 92%),
          #000000
        )
        0%,
      color-mix(
          in srgb,
          var(--velvet-surface-raised) var(--velvet-edge-inner-dim, 92%),
          #000000
        )
        46%,
      color-mix(
          in srgb,
          var(--velvet-edge-shadow, #030303) var(--velvet-edge-inner-dim, 92%),
          #000000
        )
        100%
    );

    --squircle-card-line-width: calc(
      var(--velvet-edge-depth, 3px) - var(--velvet-edge-lip, 2px)
    );
  }
</style>
