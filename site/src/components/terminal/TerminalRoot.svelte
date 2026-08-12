<script lang="ts">
  import type { Snippet } from "svelte";

  import VelvetWordmark from "../VelvetWordmark.svelte";
  import * as CRTSquircle from "../crt-squircle";
  import {
    SQUIRCLE_GLASS_EXPONENT,
    createSquircleRectPath,
  } from "../../lib/squircle.js";

  /**
   * A desktop terminal in a brass case, with the install commands on its screen
   * and a key on the front that copies them.
   *
   * It exists because the commands are meant to be read the way they will be
   * used. A block of code on a page is a block of code; the same three lines on
   * a screen, under a banner and a prompt, say where they are going before
   * anybody reads them.
   *
   * **The case is the mockup's, value for value.** Every length, colour, stop
   * and blur below is the one the design carries, in the pixels it states them
   * in rather than converted to anything else. It was paraphrased once, and
   * what came out was a case that resembled the design instead of being it: six
   * of the eighteen gradients that make up the wear were missing, the front
   * panel had none of its own, the bezel had lost the forty pixels by which it
   * overhangs, and both the glass and the rim around it were drawn as rounded
   * rectangles rather than cut with the shape the design cuts them with.
   *
   * **The screen and the clipboard cannot disagree.** The key copies what the
   * screen shows, read back out of the screen itself by the page's script,
   * rather than from a second copy of the commands kept beside it.
   *
   * **The key is wired by the page's script, not here.** These pages ship
   * prerendered with no bundle, so nothing a component renders can wire itself.
   * The key is drawn either way, because it is part of the machine's face and a
   * front panel with a hole in it is a broken machine; what the script adds is
   * what pressing it does.
   *
   * **The confirmation appears on the screen rather than under the finger.** A
   * reader who has just pressed the key is looking at the commands, so that is
   * where they are told the commands were taken. It is printed at all times and
   * only revealed, so no line on the screen moves when it appears.
   *
   * The case is drawn rather than photographed: stacked gradients for the
   * brushed metal, fractal noise multiplied over it for the wear, and soft
   * radial marks for the dents. No image, so it costs nothing to download and
   * scales to any size.
   *
   * @param commands - The lines the screen shows and the key copies.
   * @param model - What is lettered on the front, beside the mark.
   */
  let {
    commands,
    finish = "brass",
    model = "MODEL 2103",
    children,
  }: {
    /**
     * The lines the key copies, where the machine carries one.
     *
     * Its presence is what decides whether the front has a key at all, rather
     * than a flag beside it: a terminal with nothing to copy has no key, and a
     * key that copies nothing is a control that does nothing.
     */
    commands?: readonly string[];
    /** The metal it is made of. */
    finish?: "brass" | "anthracite";
    /** What is lettered on the front, beside the mark. */
    model?: string;
    /** What the screen shows. */
    children: Snippet;
  } = $props();


  /**
   * The rim the tube is bonded into, cut with the same curve as the glass it
   * holds so the two edges stay concentric.
   *
   * Its own definition rather than the tube's, because a clip path is reached
   * by id and the tube's belongs to the tube.
   */
  const NORMALISED_SIDE = 100;
  /* Two steps, because Svelte accepts `$props.id()` only as the whole
     initialiser of a declaration and refuses it inside a template literal. */
  const instanceId = $props.id();
  const rimId = `velvet-terminal-rim-${instanceId}`;
  const rimShape = createSquircleRectPath(
    NORMALISED_SIDE,
    NORMALISED_SIDE,
    0,
    undefined,
    SQUIRCLE_GLASS_EXPONENT,
  );
  const rimTransform = `scale(${1 / NORMALISED_SIDE} ${1 / NORMALISED_SIDE})`;
</script>

<!--
  The measuring frame, and the machine inside it.

  Two elements rather than one, because an element cannot be measured against
  itself: the frame takes whatever width it is given and declares itself a
  container, and the case reads that width back as `cqw` to work out its scale.
-->
<div class="frame" data-terminal>
<div class="case" class:anthracite={finish === "anthracite"} data-finish={finish}>
  <svg width="0" height="0" aria-hidden="true" focusable="false" class="shape">
    <defs>
      <clipPath id={rimId} clipPathUnits="objectBoundingBox">
        <path d={rimShape} transform={rimTransform} />
      </clipPath>
    </defs>
  </svg>

  <!-- The case around the tube: the bezel, its wear, its patina, and the lip
       the glass sits in. Every layer is drawn and none is announced. -->
  <div class="bezel">
    <span class="bezel-wear" aria-hidden="true"></span>
    <span class="bezel-patina" aria-hidden="true"></span>
    <div class="lip">
      <div class="rim" style={`clip-path: url(#${rimId})`}>
        <CRTSquircle.Root>{@render children()}</CRTSquircle.Root>
      </div>
    </div>
  </div>

  <!-- The front panel: the lamp, the mark, the key, the vents and the two
       knobs. Everything on it is drawn except the key, which is the one thing
       here that does something. -->
  <div class="panel">
    <span class="panel-patina" aria-hidden="true"></span>
    <span class="panel-wear" aria-hidden="true"></span>

    <div class="plate">
      <span class="lamp" aria-hidden="true"></span>
      <span class="mark" aria-hidden="true">
        <VelvetWordmark />
        <span class="model">{model}</span>
      </span>
    </div>

    <div class="controls">
      {#if commands}
        <button
          type="button"
          class="key"
          data-copy-terminal
          aria-label="Copy the install commands"
          disabled
        >
          <span class="cap" aria-hidden="true"></span>
          <span class="key-label" aria-hidden="true">COPY</span>
        </button>
      {/if}

      <span class="vents" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
      </span>

      <span class="knobs" aria-hidden="true">
        <span class="knob knob-left"><span></span></span>
        <span class="knob knob-right"><span></span></span>
      </span>
    </div>
  </div>

  <span class="feet" aria-hidden="true"><span></span><span></span></span>
</div>
</div>

<style>
  /* Takes the width it is given and declares itself measurable, so the case
     inside it can read that width. It draws nothing. */
  .frame {
    container-type: inline-size;
  }

  /*
    The whole machine, and the one number every length in it is a multiple of.

    `--u` is one pixel of the design, in real pixels: the case's own width
    divided by the 620 the design draws it at. Everything below states its
    measurement in those design pixels and multiplies by it, so the machine has
    one size rather than forty. Give it a narrower column and the bezel, the
    lip, the glass, the lamp, the key, the vents, the knobs, the feet, the
    lettering and the text on the screen all come down together.

    The two noise layers differ in frequency, 0.85 on the bezel and 0.9 on the
    panel, which is what stops the grain reading as one sheet laid over both.
  */
  .case {
    --u: calc(100cqw / 620);

    /*
      The metal the case is made of.

      Every tone the drawing uses is named here, so a second finish is one block
      rather than twenty edits scattered through the gradients. The two washes
      are channels rather than colours, because each is used at a dozen
      different strengths and only its hue changes between finishes.
    */
    --metal-lit: #b5a34e;
    --metal-face: #a69444;
    --metal-body: #98873a;
    --metal-deep: #7c6c25;
    --metal-edge: #6b5e24;
    --metal-lip-deep: #786826;
    --metal-lip-body: #8a782f;
    --metal-lip-face: #9a883a;
    --metal-rim-deep: #332c0e;
    --metal-rim-body: #4a4116;
    --metal-rim-face: #665a21;
    --metal-panel-lit: #6b5d23;
    --metal-panel-face: #5f5220;
    --metal-panel-deep: #4e431a;
    --metal-slot-lit: #4a4015;
    --metal-slot-deep: #241f06;
    --metal-collar: #2e2809;
    --metal-lettering: #2a2409;
    --metal-lettering-quiet: #463d16;
    --metal-lettering-hard: #171304;
    --metal-pointer: #c3b472;
    /* What the light leaves on it, and what it leaves in the hollows. */
    --metal-sheen: 255 247 205;
    --metal-shade: 46 38 10;
    --brass-noise-bezel: url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cfilter%20id%3D%27n%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%270.85%27%20numOctaves%3D%274%27%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%27100%25%27%20height%3D%27100%25%27%20filter%3D%27url%28%23n%29%27%20opacity%3D%270.5%27%2F%3E%3C%2Fsvg%3E");
    --brass-noise-panel: url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cfilter%20id%3D%27n%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%270.9%27%20numOctaves%3D%274%27%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%27100%25%27%20height%3D%27100%25%27%20filter%3D%27url%28%23n%29%27%20opacity%3D%270.5%27%2F%3E%3C%2Fsvg%3E");
    /* How worn the case is, as the strength of the noise multiplied over it.
       One value, so the bezel and the panel weather together. */
    --brass-wear: 0.55;

    position: relative;
    filter: drop-shadow(0 calc(30 * var(--u)) calc(58 * var(--u)) rgba(0, 0, 0, 0.72));
  }
  /*
    The same machine in anthracite.

    A neutral ramp of the same shape: the brass one runs from a lit face at the
    top to a shadowed one at the bottom, and so does this, at the same distances
    apart. What changes is the hue and how much of it there is, which is why the
    two washes matter as much as the ramp: a warm sheen over a grey metal reads
    as brass under a filter rather than as steel.
  */
  /* Named as a class rather than read off the attribute beside it, because
     Svelte keeps a selector it can see a `class:` directive for and strips one
     that depends on an attribute it cannot follow. The attribute stays because
     it says the same thing to anybody reading the document. */
  .case.anthracite {
    --metal-lit: #4c4f55;
    --metal-face: #43464c;
    --metal-body: #3a3d43;
    --metal-deep: #2c2f34;
    --metal-edge: #24262a;
    --metal-lip-deep: #2b2e33;
    --metal-lip-body: #34373d;
    --metal-lip-face: #3d4046;
    --metal-rim-deep: #121316;
    --metal-rim-body: #1b1d21;
    --metal-rim-face: #26282d;
    --metal-panel-lit: #292c31;
    --metal-panel-face: #23262a;
    --metal-panel-deep: #1c1e22;
    --metal-slot-lit: #1e2024;
    --metal-slot-deep: #0c0d0f;
    --metal-collar: #0f1012;
    --metal-lettering: #101114;
    --metal-lettering-quiet: #1c1e22;
    --metal-lettering-hard: #08090a;
    --metal-pointer: #8d939c;
    --metal-sheen: 232 236 242;
    --metal-shade: 10 11 13;
  }
  .shape {
    position: absolute;
    width: 0;
    height: 0;
  }

  /*
    The bezel: the body of the case around the glass.

    It overhangs its column by forty pixels on each side, which is what makes
    the case read as a piece of furniture standing in front of the page rather
    than as a panel laid inside it.
  */
  .bezel {
    position: relative;
    padding: calc(20 * var(--u)) calc(22 * var(--u)) calc(24 * var(--u));
    border-radius: calc(52 * var(--u));
    background:
      linear-gradient(
        90deg,
        rgb(var(--metal-shade) / 0.44) 0%,
        rgb(var(--metal-shade) / 0.12) 4%,
        rgb(var(--metal-sheen) / 0.1) 8%,
        transparent 20%,
        transparent 80%,
        rgb(var(--metal-sheen) / 0.1) 92%,
        rgb(var(--metal-shade) / 0.12) 96%,
        rgb(var(--metal-shade) / 0.44) 100%
      ),
      linear-gradient(
        180deg,
        var(--metal-lit) 0%,
        var(--metal-face) 30%,
        var(--metal-body) 66%,
        var(--metal-deep) 100%
      );
    box-shadow:
      inset 0 calc(3 * var(--u)) 0 rgb(var(--metal-sheen) / 0.44),
      inset 0 calc(-14 * var(--u)) calc(24 * var(--u)) rgb(var(--metal-shade) / 0.5),
      0 0 0 calc(1 * var(--u)) var(--metal-edge);
  }
  /* The grain of the brushed metal, multiplied so it darkens the brass rather
     than laying grey over it. */
  .bezel-wear {
    position: absolute;
    inset: 0;
    border-radius: calc(52 * var(--u));
    pointer-events: none;
    mix-blend-mode: multiply;
    opacity: var(--brass-wear);
    background-image: var(--brass-noise-bezel);
  }
  /*
    What twenty years in an office did to it: the sheen across the top, six
    scratches at six angles, two grains of milling, and the darkening and dents
    around the edges where hands and cables reached.

    Eighteen layers, in the order the design stacks them. Each is placed rather
    than random, because randomness at this scale reads as dirt.
  */
  .bezel-patina {
    position: absolute;
    inset: 0;
    border-radius: calc(52 * var(--u));
    pointer-events: none;
    background:
      radial-gradient(76% 60% at 50% 32%, rgb(var(--metal-sheen) / 0.12), transparent 62%),
      linear-gradient(112deg, transparent 26.8%, rgb(var(--metal-sheen) / 0.16) 27.1%, transparent 27.4%),
      linear-gradient(104deg, transparent 61%, rgb(var(--metal-sheen) / 0.11) 61.25%, transparent 61.5%),
      linear-gradient(74deg, transparent 39%, rgb(var(--metal-shade) / 0.26) 39.3%, transparent 39.6%),
      linear-gradient(88deg, transparent 72%, rgb(var(--metal-shade) / 0.2) 72.2%, transparent 72.4%),
      linear-gradient(126deg, transparent 14%, rgb(var(--metal-sheen) / 0.09) 14.3%, transparent 14.6%),
      repeating-linear-gradient(96deg, rgb(var(--metal-shade) / 0.07) 0 1px, transparent 1px 7px),
      repeating-linear-gradient(3deg, rgb(var(--metal-shade) / 0.05) 0 1px, transparent 1px 13px),
      radial-gradient(11% 26% at 3% 52%, rgb(var(--metal-shade) / 0.4), transparent 72%),
      radial-gradient(11% 26% at 97% 52%, rgb(var(--metal-shade) / 0.38), transparent 72%),
      radial-gradient(26% 12% at 50% 99%, rgb(var(--metal-shade) / 0.34), transparent 74%),
      radial-gradient(22% 10% at 50% 1%, rgb(var(--metal-shade) / 0.24), transparent 74%),
      radial-gradient(7% 6% at 80% 17%, rgb(var(--metal-shade) / 0.36), transparent 70%),
      radial-gradient(5% 4% at 15% 13%, rgb(var(--metal-shade) / 0.32), transparent 70%),
      radial-gradient(4% 3.5% at 62% 88%, rgb(var(--metal-shade) / 0.3), transparent 70%),
      radial-gradient(3% 2.6% at 33% 8%, rgb(var(--metal-shade) / 0.34), transparent 68%),
      radial-gradient(1.6% 2.4% at 8% 22%, rgb(var(--metal-shade) / 0.55), transparent 62%),
      radial-gradient(1.4% 2.2% at 92% 74%, rgb(var(--metal-shade) / 0.5), transparent 62%);
  }

  /* The lip the glass is seated in, lit from below so it reads as an edge
     turning inwards rather than a second face coming out. */
  .lip {
    position: relative;
    padding: calc(16 * var(--u));
    border-radius: calc(40 * var(--u));
    background:
      repeating-linear-gradient(92deg, rgb(var(--metal-shade) / 0.07) 0 1px, transparent 1px 6px),
      radial-gradient(30% 40% at 12% 84%, rgb(var(--metal-shade) / 0.3), transparent 70%),
      radial-gradient(24% 34% at 88% 16%, rgb(var(--metal-shade) / 0.26), transparent 70%),
      linear-gradient(180deg, var(--metal-lip-deep) 0%, var(--metal-lip-body) 26%, var(--metal-lip-face) 62%, var(--metal-face) 100%);
    box-shadow:
      inset 0 calc(-3 * var(--u)) 0 rgb(var(--metal-sheen) / 0.3),
      inset 0 calc(4 * var(--u)) calc(9 * var(--u)) rgb(var(--metal-shade) / 0.42),
      0 calc(2 * var(--u)) 0 rgb(var(--metal-sheen) / 0.26);
  }
  /* The dark rim the tube is bonded into. Cut with the glass curve rather than
     rounded, so its edge and the tube's stay concentric all the way round. */
  .rim {
    position: relative;
    padding: calc(4 * var(--u));
    background: linear-gradient(180deg, var(--metal-rim-deep) 0%, var(--metal-rim-body) 60%, var(--metal-rim-face) 100%);
  }

  /*
    The front panel below the glass, set into the case rather than standing on
    it, which is why its own light comes from below.
  */
  .panel {
    position: relative;
    margin: 0 calc(40 * var(--u));
    /* Even top and bottom, against the design's 15 and 16. What sits on this
       panel is centred in its content box, and an uneven padding puts that
       centre half a pixel off the panel a reader actually sees. */
    padding: calc(15 * var(--u)) calc(22 * var(--u));
    border-radius: 0 0 calc(24 * var(--u)) calc(24 * var(--u));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: calc(22 * var(--u));
    background: linear-gradient(180deg, var(--metal-panel-lit) 0%, var(--metal-panel-face) 56%, var(--metal-panel-deep) 100%);
    box-shadow:
      inset 0 calc(7 * var(--u)) calc(13 * var(--u)) rgb(var(--metal-shade) / 0.6),
      inset 0 calc(-2 * var(--u)) 0 rgb(var(--metal-sheen) / 0.12),
      0 calc(1 * var(--u)) 0 rgb(var(--metal-shade) / 0.5);
  }
  /* The panel's own wear: a sheen to the right of the key, a shadow to the left
     of the mark, the darkening along the bottom edge, and one scratch. */
  .panel-patina {
    position: absolute;
    inset: 0;
    border-radius: 0 0 calc(24 * var(--u)) calc(24 * var(--u));
    pointer-events: none;
    background:
      radial-gradient(16% 60% at 78% 50%, rgb(var(--metal-sheen) / 0.1), transparent 70%),
      radial-gradient(10% 50% at 26% 52%, rgb(var(--metal-shade) / 0.28), transparent 72%),
      radial-gradient(30% 22% at 50% 100%, rgb(var(--metal-shade) / 0.34), transparent 74%),
      linear-gradient(97deg, transparent 44%, rgb(var(--metal-sheen) / 0.1) 44.3%, transparent 44.6%);
  }
  .panel-wear {
    position: absolute;
    inset: 0;
    border-radius: 0 0 calc(24 * var(--u)) calc(24 * var(--u));
    pointer-events: none;
    mix-blend-mode: multiply;
    opacity: var(--brass-wear);
    background-image: var(--brass-noise-panel);
  }

  .plate {
    position: relative;
    display: flex;
    align-items: center;
    gap: calc(14 * var(--u));
  }
  /* Lit in the phosphor's own colour, so the lamp and the screen say the same
     thing about what the machine is doing. */
  .lamp {
    display: block;
    width: calc(11 * var(--u));
    height: calc(11 * var(--u));
    border-radius: 50%;
    background: var(--crt-phosphor, #7dff9b);
    box-shadow:
      0 0 calc(12 * var(--u)) color-mix(in srgb, var(--crt-phosphor, #7dff9b) 95%, transparent),
      0 0 0 calc(4 * var(--u)) var(--metal-collar),
      inset 0 calc(-1 * var(--u)) calc(1 * var(--u)) rgba(120, 70, 0, 0.6);
  }
  /* Stamped into the metal rather than printed on it, which is the highlight
     under the letters doing the work. */
  .mark {
    --velvet-wordmark-size: calc(13 * var(--u));

    display: inline-block;
    width: fit-content;
    color: var(--metal-lettering);
    line-height: 1;
    text-shadow: 0 calc(1 * var(--u)) 0 rgb(var(--metal-sheen) / 0.34);
  }
  /*
    The model line under the mark.

    Larger and darker than the design draws it, and closer to the word above it.
    At eight units it rendered 6.55px on a case this size, in a tone that
    measured 1.4:1 against the brass, which is a line nobody can read. It takes
    the mark's own colour now, so the panel carries one lettering tone rather
    than two, and the highlight the mark casts beneath its letters is what makes
    an engraved line legible at all: on metal this light, the contrast of the
    fill never can be.
  */
  .model {
    display: block;
    margin-top: calc(2 * var(--u));
    color: inherit;
    white-space: nowrap;
    font-family: "IBM Plex Mono", monospace;
    font-size: calc(12 * var(--u));
    font-weight: 600;
    line-height: 1;
    letter-spacing: 0.18em;
  }

  .controls {
    position: relative;
    display: flex;
    align-items: center;
    gap: calc(16 * var(--u));
  }

  /*
    The one thing on this machine that does anything.

    It is drawn whether or not the page's script reached it, because it is part
    of the front panel. What the script adds is the press: until then the key is
    a key on a machine that is not plugged in.
  */
  /*
    The cap and its word, as one group, set two units below the middle.

    The group measures as centred on the panel's content box, to 0.00, and still
    reads high: the cap's ring is a spread shadow, so it reaches five units
    above the cap without being part of the box the browser centres. Two units
    of padding puts the visible mass where the middle is.
  */
  .key {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(6 * var(--u));
    padding: calc(2 * var(--u)) 0 0;
    border: 0;
    background: none;
    font: inherit;
  }
  .key:not([disabled]) {
    cursor: pointer;
  }
  /* The cap: red, because on a machine of this kind the one key that acts is
     always the red one. It stands proud on a hard shadow and goes down onto it
     when pressed. */
  .cap {
    display: block;
    width: calc(26 * var(--u));
    height: calc(26 * var(--u));
    border-radius: calc(5 * var(--u));
    background: linear-gradient(180deg, #f2472f 0%, #d5291a 56%, #a31a0e 100%);
    box-shadow:
      0 0 0 calc(4 * var(--u)) var(--metal-collar),
      0 0 0 calc(5 * var(--u)) rgb(var(--metal-sheen) / 0.16),
      0 calc(3 * var(--u)) 0 #55110a,
      0 calc(4 * var(--u)) calc(6 * var(--u)) rgba(28, 10, 4, 0.6),
      inset 0 calc(1 * var(--u)) 0 rgba(255, 196, 180, 0.6);
    transition:
      transform 60ms ease-out,
      box-shadow 60ms ease-out;
  }
  .key:active .cap {
    transform: translateY(calc(3 * var(--u)));
    box-shadow:
      0 0 0 calc(4 * var(--u)) var(--metal-collar),
      0 0 0 calc(5 * var(--u)) rgb(var(--metal-sheen) / 0.16),
      0 0 0 #55110a,
      0 calc(1 * var(--u)) calc(2 * var(--u)) rgba(28, 10, 4, 0.7),
      inset 0 calc(2 * var(--u)) calc(5 * var(--u)) rgba(80, 8, 2, 0.6);
  }
  .key:focus-visible .cap {
    box-shadow:
      0 0 0 calc(4 * var(--u)) var(--metal-collar),
      0 0 0 calc(6 * var(--u)) var(--velvet-accent),
      0 calc(3 * var(--u)) 0 #55110a,
      0 calc(4 * var(--u)) calc(6 * var(--u)) rgba(28, 10, 4, 0.6),
      inset 0 calc(1 * var(--u)) 0 rgba(255, 196, 180, 0.6);
  }
  /* A fixed width, so the word under the cap cannot move the cap. */
  .key-label {
    display: block;
    width: calc(66 * var(--u));
    color: var(--metal-lettering-hard);
    font-family: "IBM Plex Mono", monospace;
    font-size: calc(10 * var(--u));
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.18em;
    text-align: center;
    text-shadow: 0 calc(1 * var(--u)) 0 rgb(var(--metal-sheen) / 0.34);
  }

  /* The slots the case breathes through, cut into the panel rather than laid on
     it, which is the highlight under each one doing the work. */
  .vents {
    display: flex;
    flex-direction: column;
    gap: calc(3 * var(--u));
  }
  .vents span {
    display: block;
    width: calc(30 * var(--u));
    height: calc(3 * var(--u));
    border-radius: calc(2 * var(--u));
    background: linear-gradient(180deg, var(--metal-slot-lit), var(--metal-slot-deep));
    box-shadow: 0 calc(1 * var(--u)) 0 rgb(var(--metal-sheen) / 0.22);
  }

  .knobs {
    display: flex;
    gap: calc(13 * var(--u));
  }
  .knob {
    position: relative;
    display: block;
    width: calc(28 * var(--u));
    height: calc(28 * var(--u));
    border-radius: 50%;
    background: radial-gradient(circle at 36% 28%, #4e4739, #141210 74%);
    box-shadow:
      0 0 0 calc(4 * var(--u)) var(--metal-collar),
      0 0 0 calc(5 * var(--u)) rgb(var(--metal-sheen) / 0.16),
      0 calc(2 * var(--u)) calc(4 * var(--u)) rgb(var(--metal-shade) / 0.65),
      inset 0 calc(1 * var(--u)) 0 rgba(255, 255, 255, 0.16);
  }
  /* The pointer on each knob, turned to a different setting, because two
     controls left at the same mark read as one control drawn twice. */
  .knob span {
    position: absolute;
    left: 50%;
    top: calc(5 * var(--u));
    width: calc(2 * var(--u));
    height: calc(8 * var(--u));
    margin-left: calc(-1 * var(--u));
    border-radius: calc(1 * var(--u));
    background: var(--metal-pointer);
    transform-origin: 50% calc(9 * var(--u));
  }
  .knob-left span {
    transform: rotate(-32deg);
  }
  .knob-right span {
    transform: rotate(48deg);
  }

  /* What it stands on. Two, set in from the corners, so the case reads as
     resting on a desk rather than floating over one. */
  .feet {
    position: relative;
    display: flex;
    justify-content: space-between;
    margin: 0 calc(78 * var(--u));
  }
  .feet span {
    width: calc(40 * var(--u));
    height: calc(13 * var(--u));
    border-radius: 0 0 calc(7 * var(--u)) calc(7 * var(--u));
    background: linear-gradient(180deg, var(--metal-slot-lit), var(--metal-slot-deep));
  }

  /* The one thing on the case that moves rests under reduced motion. */
  @media (prefers-reduced-motion: reduce) {
    .cap {
      transition: none;
    }
  }
</style>
