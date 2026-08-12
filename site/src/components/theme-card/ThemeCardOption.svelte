<script lang="ts">
  import {
    SQUIRCLE_CONTENT_INSET,
    SQUIRCLE_INNER_PATH_INSET,
    SQUIRCLE_OUTER_PATH_INSET,
    createSquirclePath,
  } from "../../lib/squircle.js";

  /**
   * The two outlines a step carries, in the same order and at the same insets,
   * because this is the same shape rather than one that resembles it.
   */

  let {
    name,
    era = "",
    value,
    screenshot,
    selected,
    radioName,
    onSelect,
  }: {
    name: string;
    /**
     * The period the option belongs to, shown after the name.
     *
     * Empty where an option has none, and then nothing is drawn for it.
     */
    era?: string;
    value: string;
    screenshot: string;
    selected: boolean;
    radioName: string;
    onSelect: (value: string) => void;
  } = $props();

  let size = $state(0);
  const outerPath = $derived(createSquirclePath(size, SQUIRCLE_OUTER_PATH_INSET));
  const innerPath = $derived(createSquirclePath(size, SQUIRCLE_INNER_PATH_INSET));
  const contentPath = $derived(createSquirclePath(size, SQUIRCLE_CONTENT_INSET));
  /**
   * Clips the option to the inner edge of that line, so the preview meets it
   * on the left, the right, and the top and is cut by the curve rather than
   * held away from it. A squircle is not a radius, so nothing but a path can
   * do this.
   */
  const clip = $derived(contentPath ? `path("${contentPath}")` : "none");
</script>

<label class:selected data-theme-card-option={value} bind:clientWidth={size}>
  <input
    type="radio"
    name={radioName}
    value={value}
    checked={selected}
    onchange={() => onSelect(value)}
  />
  <span class="body" style:clip-path={clip}>
    <!--
      Deferred on purpose, which is the opposite of the picture on the website
      and right for the same reason. These four previews weigh 360 KB together,
      more than the whole application bundle, and the step that shows them sits
      behind two forms. Measured before this: all four were fetched whilst the
      first step was on screen.

      Nothing moves when they arrive, because the option is square and the
      preview holds a fixed share of it.
    -->
    <img src={screenshot} alt="" loading="lazy" decoding="async" />
    <strong>{name}{#if era}<span class="era">{era}</span>{/if}</strong>
  </span>
  <svg
    class="outline"
    data-theme-card-squircle
    viewBox={`0 0 ${Math.max(size, 1)} ${Math.max(size, 1)}`}
    aria-hidden="true"
  >
    <path
      d={outerPath}
      fill="none"
      stroke="currentColor"
      stroke-width="1"
      stroke-linejoin="round"
    ></path>
    <path
      d={innerPath}
      fill="none"
      stroke="currentColor"
      stroke-width="4"
      stroke-linejoin="round"
    ></path>
  </svg>
</label>

<style>
  label {
    position: relative;
    min-width: 0;
    aspect-ratio: 1;
    display: block;
    padding: 0;
    border: 0;
    /* What a completed step draws its outline in, so an option somebody has
       not chosen sits at the same weight as a step already behind them. */
    color: color-mix(in srgb, var(--picker-accent, #6366f1) 55%, transparent);
    cursor: pointer;
    transition:
      color 200ms ease-in-out,
      transform 200ms ease-in-out;
  }
  label:hover {
    transform: scale(1.03);
  }
  label.selected {
    color: var(--velvet-selection);
  }
  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .body {
    position: absolute;
    inset: 0;
    display: grid;
    /* The name takes the height its one line needs and the preview takes the
       rest, so the picture is what the option is mostly made of. */
    grid-template-rows: 1fr auto;
    background: var(--picker-surface, #ffffff);
  }
  img {
    width: 100%;
    height: 100%;
    display: block;
    /* Fitted rather than filled. These previews are wider than the space is,
       and filling it cut the page's own headings in half at both edges, which
       reads as a broken picture rather than a cropped one. */
    object-fit: contain;
    object-position: top center;
  }
  strong {
    overflow: hidden;
    /* Enough below the line to clear the bottom curve, which is why the two
       are not equal. */
    padding: 0.85rem var(--theme-card-option-text-inset, 0.5rem) 1.35rem;
    color: var(--picker-text, #171922);
    font-size: var(--theme-card-font-size, 0.85rem);
    line-height: 1.25;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .era {
    /* Set apart in CSS rather than by a space in the markup, which Svelte
       strips at the start of an element. */
    margin-inline-start: 0.4em;
    /* Read as what the name belongs to rather than as part of the name, which
       is how the start page sets the same pair. */
    color: var(--picker-muted, #6f7280);
    font-variant-numeric: tabular-nums;
  }
  .outline {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
    pointer-events: none;
  }
  label:has(input:focus-visible) .outline {
    filter: drop-shadow(0 0 4px currentColor);
  }

  @media (prefers-reduced-motion: reduce) {
    label {
      transition: none;
    }
    label:hover {
      transform: none;
    }
  }
</style>
