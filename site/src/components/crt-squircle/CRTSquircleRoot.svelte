<script lang="ts">
  import type { Snippet } from "svelte";

  import {
    SQUIRCLE_GLASS_EXPONENT,
    createSquircleRectPath,
  } from "../../lib/squircle.js";

  /**
   * A green phosphor tube, in Velvet's own shape.
   *
   * The screen is a squircle rather than a rounded rectangle, so the glass
   * reads as part of the same family as the cards and the status mark. It
   * carries what a cathode ray tube does and nothing it does not: the
   * phosphor's single colour, the lines the beam leaves between its passes, the
   * band that sweeps down as the picture refreshes, the bloom a bright phosphor
   * throws onto the glass, and the fall-off towards the corners.
   *
   * The tube states the colour and draws the glass; what stands on it is
   * whatever the caller puts there, set in the phosphor with the halo such a
   * screen gives its own text.
   *
   * Normalised, like {@link SquircleCardRoot}, so it needs no measurement and
   * works on a page that ships prerendered and loads no script.
   *
   * The screen is a size container, so anything inside it can be sized in `cqw`
   * and scale with the tube rather than with the window. A terminal whose text
   * grew with the window would run off a screen that had not grown with it.
   *
   * @param children - What the screen shows.
   */
  let { children }: { children: Snippet } = $props();

  /** The square the shape is stated in before it is stretched. */
  const NORMALISED_SIDE = 100;
  const instanceId = $props.id();
  const clipId = `velvet-crt-${instanceId}`;
  /* The glass curve rather than the surface one, which is what the mockup cuts
     both the tube and the rim around it with. Squarer at the corners and
     rounder along the sides than a card, because that is the shape a cathode
     ray tube's face actually has. */
  const shape = createSquircleRectPath(
    NORMALISED_SIDE,
    NORMALISED_SIDE,
    0,
    undefined,
    SQUIRCLE_GLASS_EXPONENT,
  );
  const shapeTransform = `scale(${1 / NORMALISED_SIDE} ${1 / NORMALISED_SIDE})`;
</script>

<div class="tube" data-crt-squircle style={`--crt-clip: url(#${clipId})`}>
  <svg width="0" height="0" aria-hidden="true" focusable="false" class="shape">
    <defs>
      <clipPath id={clipId} clipPathUnits="objectBoundingBox">
        <path d={shape} transform={shapeTransform} />
      </clipPath>
    </defs>
  </svg>

  <div class="screen">
    <div class="content">
      {@render children()}
    </div>
    <!-- What the tube adds, in the order it adds it: the lines the beam leaves,
         the band it sweeps down as it refreshes, the bloom it throws, and the
         fall-off towards the glass at the corners. -->
    <div class="scanlines" aria-hidden="true"></div>
    <div class="sweep" aria-hidden="true"><span></span></div>
    <div class="bloom" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>
  </div>
</div>

<style>
  .tube {
    /* The phosphor's own green, and the glass it sits behind. Stated once here
       so every layer below reads from the same pair. */
    --crt-phosphor: #7dff9b;
    --crt-glass: #0a0703;

    position: relative;
    display: block;
    filter: drop-shadow(
      0 0 2.125rem color-mix(in srgb, var(--crt-phosphor) 20%, transparent)
    );
  }
  .shape {
    position: absolute;
    width: 0;
    height: 0;
  }
  /*
    Everything the tube shows is cut to the shape here rather than layer by
    layer, so the lines, the bloom and the fall-off all stop at the same edge.

    Four by three, because that is the shape of the screens this one is drawn
    after, and a size container so its contents can be measured against it.
  */
  .screen {
    position: relative;
    display: grid;
    aspect-ratio: 4 / 3;
    container-type: size;
    overflow: hidden;
    clip-path: var(--crt-clip);
    background: var(--crt-glass);
  }
  /* What the screen shows, in the phosphor's colour with the halo such a screen
     gives its own text. Centred, because a terminal's output stands in the
     middle of the glass rather than in a corner of it. */
  .content {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    padding: 2%;
    color: var(--crt-phosphor);
    text-shadow: 0 0 8px color-mix(in srgb, var(--crt-phosphor) 50%, transparent);
  }
  /* The lines the beam leaves between its passes. Three pixels apart, because
     one line per pixel disappears on a dense display and two reads as a mesh. */
  .scanlines {
    grid-area: 1 / 1;
    background: repeating-linear-gradient(
      to bottom,
      rgb(0 0 0 / 0.55) 0 1px,
      transparent 1px 3px
    );
    pointer-events: none;
  }
  /*
    The band that travels down the glass as the picture refreshes.

    It animates `transform` and nothing else, so it stays on the compositor and
    the page is never laid out again for it. The band starts above the screen
    and ends below it, which is why the wrapper clips.
  */
  .sweep {
    grid-area: 1 / 1;
    overflow: hidden;
    pointer-events: none;
  }
  .sweep span {
    display: block;
    /* A share of the glass rather than a length, so the band stays the same
       band on a tube of any size. Eleven hundredths of the screen's height is
       the 44px the design draws it at on the screen it draws. */
    height: 11cqh;
    background: linear-gradient(
      180deg,
      transparent,
      color-mix(in srgb, var(--crt-phosphor) 10%, transparent),
      transparent
    );
    animation: velvet-crt-sweep 11s linear infinite;
  }
  @keyframes velvet-crt-sweep {
    from {
      transform: translateY(-120%);
    }
    to {
      transform: translateY(1100%);
    }
  }
  /* The glow a bright phosphor throws onto the glass in front of it. Added
     rather than multiplied, so it lifts what is on the screen instead of
     tinting it. */
  .bloom {
    grid-area: 1 / 1;
    background: radial-gradient(
      ellipse at 50% 42%,
      color-mix(in srgb, var(--crt-phosphor) 16%, transparent) 0%,
      transparent 62%
    );
    mix-blend-mode: screen;
    pointer-events: none;
  }
  /* The fall-off towards the corners, where the beam reaches furthest and the
     glass is thickest. */
  .vignette {
    grid-area: 1 / 1;
    background: radial-gradient(
      ellipse at center,
      transparent 46%,
      rgb(0 0 0 / 0.66) 100%
    );
    pointer-events: none;
  }

  /* The sweep is the one thing on the tube that moves of its own accord, and it
     says nothing, so it stops rather than slowing down. */
  @media (prefers-reduced-motion: reduce) {
    .sweep span {
      animation: none;
      opacity: 0;
    }
  }
</style>
