<script lang="ts">
  import { createSquirclePath } from "../../lib/squircle.js";

  const OUTER_PATH_INSET = 1;
  const INNER_PATH_INSET = 5.5;

  let {
    label,
    icon,
    selected,
    tabIndex,
    onSelect,
    onKeydown,
  }: {
    label: string;
    icon: string;
    selected: boolean;
    tabIndex: number;
    onSelect: () => void;
    onKeydown: (event: KeyboardEvent) => void;
  } = $props();

  let size = $state(0);
  const outerPath = $derived(createSquirclePath(size, OUTER_PATH_INSET));
  const innerPath = $derived(createSquirclePath(size, INNER_PATH_INSET));
  const focusPath = $derived(createSquirclePath(size, 3));
</script>

<button
  class="service-icon-option"
  type="button"
  role="option"
  aria-selected={selected}
  aria-label={label}
  title={label}
  tabindex={tabIndex}
  onclick={onSelect}
  onkeydown={onKeydown}
  bind:clientWidth={size}
>
  <svg
    class="service-icon-option-shape"
    data-service-icon-squircle
    viewBox={`0 0 ${Math.max(size, 1)} ${Math.max(size, 1)}`}
    aria-hidden="true"
  >
    <path class="option-background" d={outerPath}></path>
    <path
      class="selection-outline outer"
      d={outerPath}
      fill="none"
      stroke="currentColor"
      stroke-width="1"
      stroke-linejoin="round"
    ></path>
    <path
      class="selection-outline inner"
      d={innerPath}
      fill="none"
      stroke="currentColor"
      stroke-width="4"
      stroke-linejoin="round"
    ></path>
    <path class="focus-outline" d={focusPath}></path>
  </svg>
  <i class={`service-icon-option-icon ph-duotone ${icon}`} aria-hidden="true"></i>
</button>

<style>
  .service-icon-option {
    position: relative;
    min-width: 0;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--picker-text, #171922);
    cursor: pointer;
    font: inherit;
  }
  .service-icon-option > .service-icon-option-shape {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
    pointer-events: none;
  }
  .service-icon-option .option-background {
    fill: color-mix(
      in srgb,
      var(--picker-accent, #6366f1) 28%,
      var(--picker-popover, var(--picker-surface, #ffffff))
    );
    opacity: 0;
    transition: none;
  }
  /* Where these render small, two concentric rings stop reading as two rings
     and blur together, so a consumer can ask for one outline instead. Driven
     by a variable rather than a measured width, because measuring an element
     in order to change how it renders invites a feedback loop. */
  .service-icon-option .selection-outline.inner {
    display: var(--picker-inner-ring-display, block);
  }
  .service-icon-option .selection-outline.outer {
    stroke-width: var(--picker-outer-ring-width, 1);
  }
  .service-icon-option .selection-outline {
    color: var(--picker-accent, #6366f1);
    opacity: 0;
    transform: scale(var(--picker-selection-scale, 1));
    transform-box: fill-box;
    transform-origin: center;
    vector-effect: non-scaling-stroke;
    transition: opacity 200ms ease-in-out;
  }
  .service-icon-option .selection-outline.outer {
    opacity: 0;
  }
  .service-icon-option .focus-outline {
    fill: none;
    stroke: color-mix(
      in srgb,
      var(--picker-accent, #6366f1) 55%,
      transparent
    );
    stroke-width: 2;
    opacity: 0;
    transition: opacity 200ms ease-in-out;
  }
  .service-icon-option:hover .option-background,
  .service-icon-option:focus-visible .option-background {
    opacity: 1;
  }
  .service-icon-option:focus-visible .focus-outline {
    opacity: 1;
  }
  .service-icon-option[aria-selected="true"] .selection-outline {
    opacity: 1;
  }
  .service-icon-option[aria-selected="true"] .service-icon-option-icon {
    color: var(--picker-selected-icon, #fff);
  }
  .service-icon-option > .service-icon-option-icon {
    position: relative;
    z-index: 1;
    color: var(--picker-accent, #6366f1);
    font-size: var(--picker-icon-size, 1.4rem);
    transition: none;
  }
  .service-icon-option:hover > .service-icon-option-icon,
  .service-icon-option:focus-visible > .service-icon-option-icon {
    transform: scale(1.1);
  }

  @media (prefers-reduced-motion: reduce) {
    .service-icon-option .selection-outline,
    .service-icon-option .focus-outline {
      transition-duration: 0s;
    }
    .service-icon-option:hover > .service-icon-option-icon,
    .service-icon-option:focus-visible > .service-icon-option-icon {
      transform: none;
    }
  }
</style>
