<script lang="ts">
  import type { Snippet } from "svelte";

  import { createSquircleRectPath } from "../../lib/squircle.js";

  /**
   * A green phosphor monitor, in Velvet's own shape.
   *
   * The screen is a squircle rather than a rounded rectangle, so the tube reads
   * as part of the same family as the cards and the status mark. It carries
   * what a cathode ray tube does to a picture and nothing it does not: the
   * phosphor's single colour, the scan lines, the bloom around bright areas,
   * and the fall-off towards the corners.
   *
   * Normalised, like {@link SquircleCardRoot}, so it needs no measurement and
   * works on a page that ships prerendered and loads no script.
   *
   * Nothing here is decoration for its own sake. A picture of a status page is
   * already a picture of a screen, so a second window frame around it would
   * read as a screenshot of a screenshot. The tube replaces that frame.
   *
   * @param children - What the screen shows, ordinarily one picture.
   */
  let { children }: { children: Snippet } = $props();

  /** The square the shape is stated in before it is stretched. */
  const NORMALISED_SIDE = 100;
  const instanceId = $props.id();
  const clipId = `velvet-crt-${instanceId}`;
  const shape = createSquircleRectPath(NORMALISED_SIDE, NORMALISED_SIDE);
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
    <div class="picture">
      {@render children()}
    </div>
    <!-- What the tube adds, in the order it adds it: the phosphor's colour over
         a picture reduced to brightness, the lines the beam leaves, the bloom
         it throws, and the fall-off towards the glass at the corners. -->
    <div class="phosphor" aria-hidden="true"></div>
    <div class="scanlines" aria-hidden="true"></div>
    <div class="bloom" aria-hidden="true"></div>
    <div class="vignette" aria-hidden="true"></div>
  </div>
</div>

<style>
  .tube {
    /* The phosphor's own green, and the glass it sits behind. Stated once here
       so every layer below reads from the same pair. */
    --crt-phosphor: #7dff9b;
    --crt-glass: #060a07;

    position: relative;
    display: block;
    filter: drop-shadow(0 1.5rem 3rem rgb(0 0 0 / 0.55))
      drop-shadow(0 0 2.5rem color-mix(in srgb, var(--crt-phosphor) 22%, transparent));
  }
  .shape {
    position: absolute;
    width: 0;
    height: 0;
  }
  /*
    Everything the tube shows is cut to the shape here rather than layer by
    layer, so the lines, the bloom and the fall-off all stop at the same edge.
  */
  .screen {
    position: relative;
    display: grid;
    overflow: hidden;
    clip-path: var(--crt-clip);
    background: var(--crt-glass);
  }
  /*
    The picture, reduced to brightness. A phosphor emits one colour, so what
    reaches the glass is the picture's luminance and nothing of its own hues.
    Contrast is lifted a little because a tube has less of it than a panel and
    the picture would otherwise read as grey.
  */
  .picture {
    grid-area: 1 / 1;
    filter: grayscale(1) contrast(1.15) brightness(1.05);
  }
  .picture :global(img) {
    width: 100%;
    height: auto;
    display: block;
  }
  /* The colour itself, multiplied onto that brightness, which is what leaves a
     bright area green and a dark one black rather than tinting the whole
     picture evenly. */
  .phosphor {
    grid-area: 1 / 1;
    background: var(--crt-phosphor);
    mix-blend-mode: multiply;
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
  /* The glow a bright phosphor throws onto the glass in front of it. Added
     rather than multiplied, so it lifts the picture instead of tinting it. */
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
      transparent 48%,
      rgb(0 0 0 / 0.62) 100%
    );
    pointer-events: none;
  }
</style>
