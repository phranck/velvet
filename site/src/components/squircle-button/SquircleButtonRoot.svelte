<script lang="ts">
  import type { Snippet } from "svelte";

  import {
    SQUIRCLE_CONTENT_INSET,
    createSquircleRectPath,
  } from "../../lib/squircle.js";

  /**
   * A square button carrying Velvet's own shape, with its icon above its label.
   *
   * Two things make it different from `.velvet-button`, which is a row of icon
   * and text in a rounded rectangle. Its edge is the squircle the rest of the
   * site is cut from rather than a `border-radius`, and it is square, so a row
   * of them reads as a row of keys rather than as a row of sentences of
   * different lengths.
   *
   * **It decides its own size and its own colours.** Everything it draws with
   * has a default here, and a caller changes one through a prop rather than by
   * declaring a custom property beside it. A component whose appearance depends
   * on what the page around it happens to have set is a component that looks
   * different in the next place it is used.
   *
   * **What a prop sets is a resting value, and the states derive from it.** An
   * inline `style` attribute beats every selector, so a property written there
   * cannot be changed by a rule for `:hover` or `:focus-visible`: the hover
   * fired, the declaration lost, and nothing moved. The props therefore write
   * `…-rest` properties and the stylesheet reads those, which leaves the states
   * competing with an ordinary rule rather than with an attribute.
   *
   * **Nothing outside it may change its shape.** A grid parent stretches its
   * items and a flex parent grows them, and either takes the square away,
   * because `aspect-ratio` yields to a height something else made definite. The
   * root refuses both rather than relying on every page to lay it out kindly.
   *
   * **The padding is derived from the button's own side.** A percentage padding
   * resolves against the containing block's width, so the same button padded
   * itself by 8px in a narrow row and by 84px in a wide one, and the second
   * forced the box open to 168px. `SQUIRCLE_CONTENT_INSET` is where the shape's
   * own inner line stands in the hundred-unit space every Velvet squircle is
   * drawn in, and the padding is that share of the side.
   *
   * **The edge is a masked ring**, drawn the way `SquircleCard` draws its two.
   * A `border` is painted outside the padding box and `clip-path` cuts the
   * element afterwards, so a bordered squircle loses its edge along the curves.
   * An inset shadow is no better: it bands the padding box's own rectangle, so
   * clipping it leaves an edge with straight sides and open corners. A ring is
   * the shape masked by a copy of itself shrunk by twice the line's width and
   * taken away, so the band follows the curve and its width stays in pixels
   * whilst the shape is free to be any size.
   */
  interface Props {
    /** Where it goes. An anchor where given, a button where not. */
    href?: string;
    /**
     * What a screen reader announces.
     *
     * It has to contain the visible word: `aria-label` replaces the contents
     * rather than adding to them, so a key reading "Create" whose label says
     * "Create your status page" is announced in full and is still found by
     * somebody saying "create".
     */
    label: string;
    /** `primary` for the one action a page asks for, `secondary` beside it. */
    variant?: "primary" | "secondary";
    /** How tall it is, as a CSS length. Its width follows from the ratio. */
    size?: string;
    /**
     * Width against height. One is square, which is the default; a wider key
     * takes a longer word without setting it in two lines.
     */
    ratio?: number;
    /** The face it is cut from. Defaults to the variant's own. */
    surface?: string;
    /** The thick edge around it. Defaults to the variant's own. */
    edge?: string;
    /** The icon and the label. Defaults to the variant's own. */
    foreground?: string;
    /** How thick that edge is drawn at rest. */
    edgeWidth?: string;
    download?: boolean;
    target?: string;
    rel?: string;
    children: Snippet;
    [key: string]: unknown;
  }

  let {
    href,
    label,
    variant = "secondary",
    size = "7rem",
    ratio = 1,
    surface,
    edge,
    foreground,
    edgeWidth = "3px",
    download = false,
    target,
    rel,
    children,
    ...rest
  }: Props = $props();

  /** The square the shape is stated in before it is fitted to the button. */
  const NORMALISED_SIDE = 100;

  /**
   * What each variant is drawn in, settled here rather than left to the page.
   *
   * The values are the design system's own, so a change to the accent reaches
   * this button as it reaches everything else, whilst which of them this button
   * uses is decided here and nowhere else.
   */
  const VARIANTS = {
    primary: {
      surface: "var(--velvet-accent)",
      edge: "color-mix(in srgb, var(--velvet-accent) 45%, #000000)",
      foreground: "var(--velvet-on-accent)",
    },
    secondary: {
      surface: "var(--velvet-surface-raised)",
      edge: "color-mix(in srgb, var(--velvet-text) 32%, transparent)",
      foreground: "var(--velvet-text)",
    },
  } as const;

  const chosen = $derived(VARIANTS[variant]);
  const instanceId = $props.id();
  const clipId = `velvet-squircle-button-${instanceId}`;
  const shape = createSquircleRectPath(NORMALISED_SIDE, NORMALISED_SIDE);
  const shapeTransform = `scale(${1 / NORMALISED_SIDE} ${1 / NORMALISED_SIDE})`;
  const insetShare = SQUIRCLE_CONTENT_INSET / NORMALISED_SIDE;
  /** The shape again, as an image a mask can be sized in pixels against. */
  const shapeImage =
    `url("data:image/svg+xml,` +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${NORMALISED_SIDE} ${NORMALISED_SIDE}" preserveAspectRatio="none"><path d="${shape}" fill="#fff"/></svg>`,
    ) +
    `")`;
</script>

<svelte:element
  this={href ? "a" : "button"}
  class="root"
  {href}
  type={href ? undefined : "button"}
  aria-label={label}
  download={href && download ? true : undefined}
  {target}
  {rel}
  style={`--squircle-button-clip: url(#${clipId});
          --squircle-button-size: ${size};
          --squircle-button-ratio: ${ratio};
          --squircle-button-inset-share: ${insetShare};
          --squircle-button-edge-width-rest: ${edgeWidth};
          --squircle-button-shape-image: ${shapeImage};
          --squircle-button-surface: ${surface ?? chosen.surface};
          --squircle-button-edge-rest: ${edge ?? chosen.edge};
          --squircle-button-foreground: ${foreground ?? chosen.foreground}`}
  {...rest}
>
  <svg width="0" height="0" aria-hidden="true" focusable="false" class="shape">
    <defs>
      <clipPath id={clipId} clipPathUnits="objectBoundingBox">
        <path d={shape} transform={shapeTransform} />
      </clipPath>
    </defs>
  </svg>
  <span class="edge" aria-hidden="true"></span>
  {@render children()}
</svelte:element>

<style>
  .root {
    position: relative;
    /* The height is stated and the width follows, so a wider key is a wider
       key rather than a shorter one. */
    height: var(--squircle-button-size);
    aspect-ratio: var(--squircle-button-ratio);
    /* Where the key sits is the page's decision, not this component's. It
       claimed the centre of its own cell before, which a `justify-self` on the
       item enforces over any `justify-items` the container states: a key placed
       in a left-ranged column still centred itself and stood 233px in from the
       text above it. What this does refuse is being resized, which is a
       property of the key rather than of where it was put. */
    flex: none;
    display: grid;
    /* The icon takes what it needs and the label the rest, so two keys whose
       labels wrap differently still align on their icons. */
    grid-template-rows: auto auto;
    align-content: center;
    justify-items: center;
    gap: 0.4rem;
    padding: calc(
      var(--squircle-button-size) * var(--squircle-button-inset-share)
    );
    border: 0;
    outline: none;
    clip-path: var(--squircle-button-clip);
    background: var(--squircle-button-surface);
    color: var(--squircle-button-foreground);
    font: inherit;
    font-weight: 650;
    line-height: 1;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    /* The press is a transform, which a compositor animates on its own. The
       edge is the rest of what says the key answered. */
    transition: transform 90ms ease-out;

    /* The label's size, stated once. The icon derives its own from it, so the
       two move together rather than being two numbers to keep in step. */
    /* The word on the key, and through it the picture above it, which derives
       its own size from this. Its own value rather than a step of the reading
       scale: a key is a control the size of a thumb, not a line of prose, and
       taking the copy size put a 42px picture inside an 85px key with six
       pixels of padding left over. */
    --squircle-button-label-size: 1.0625rem;
    /* What the key is drawn with now, which the states below change. */
    --squircle-button-edge: var(--squircle-button-edge-rest);
    --squircle-button-edge-width: var(--squircle-button-edge-width-rest);
  }

  /* Hovering thickens the edge, so the shape is what answers and a primary key
     does not go pale. */
  @media (hover: hover) {
    .root:hover {
      --squircle-button-edge-width: calc(
        var(--squircle-button-edge-width-rest) * 2
      );
    }
  }

  /* Pressed: the key goes down. Small, because a key this size travelling far
     reads as the page moving rather than as the key being pressed. */
  .root:active {
    transform: scale(0.94);

    --squircle-button-edge-width: calc(
      var(--squircle-button-edge-width-rest) * 3
    );
  }

  .root:focus-visible {
    --squircle-button-edge: var(--velvet-accent);
    --squircle-button-edge-width: calc(
      var(--squircle-button-edge-width-rest) * 2
    );
  }

  @media (prefers-reduced-motion: reduce) {
    .root {
      transition: none;
    }

    .root:active {
      transform: none;
    }
  }

  .shape {
    position: absolute;
    width: 0;
    height: 0;
  }

  /*
    The shape, less a copy of itself shrunk by twice the line's width. What
    survives is a band of exactly that width, following the curve.
  */
  .edge {
    position: absolute;
    inset: 0;
    background: var(--squircle-button-edge);
    mask-image: var(--squircle-button-shape-image),
      var(--squircle-button-shape-image);
    /*
      The outer half of the ring is drawn past the element and cut off by the
      root's own `clip-path`, so one shape defines the silhouette.

      Drawn to the element's own size instead, the ring's outer boundary and
      the clip are two rasterisations of the same curve that disagree by a
      fraction of a pixel, and the contour comes out ragged with a fringe along
      it. Only the inner boundary has to be exact, and that one the mask owns
      alone.
    */
    mask-size:
      calc(100% + 4px) calc(100% + 4px),
      calc(100% - 2 * var(--squircle-button-edge-width))
        calc(100% - 2 * var(--squircle-button-edge-width));
    mask-position: center, center;
    mask-repeat: no-repeat, no-repeat;
    mask-composite: subtract;
    transition: mask-size 120ms ease-out;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .edge {
      transition: none;
    }
  }
</style>
