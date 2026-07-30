<script lang="ts">
  import type { Snippet } from "svelte";
  import { SQUIRCLE_PATH } from "../lib/squircle.js";

  let {
    color,
    size = 22,
    borderColor = "var(--tool-line)",
    children,
  }: {
    color: string;
    size?: number;
    borderColor?: string;
    children?: Snippet;
  } = $props();

</script>

<span
  class="color-swatch"
  data-color-swatch
  aria-hidden={children ? undefined : "true"}
  style:width={`${size}px`}
  style:height={`${size}px`}
>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <path
      data-squircle-shape
      d={SQUIRCLE_PATH}
      fill={color}
      stroke={borderColor}
      stroke-width="1"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    ></path>
  </svg>
  {@render children?.()}
</span>

<style>
  .color-swatch {
    position: relative;
    display: inline-block;
    flex: none;
    vertical-align: middle;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
    pointer-events: none;
  }
  .color-swatch:focus-within {
    outline: 2px solid var(--tool-accent);
    outline-offset: 2px;
  }
  .color-swatch :global(input[type="color"]) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }
</style>
