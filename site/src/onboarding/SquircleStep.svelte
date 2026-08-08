<script lang="ts">
  import {
    SQUIRCLE_INNER_PATH_INSET,
    SQUIRCLE_OUTER_PATH_INSET,
    createSquirclePath,
  } from "../lib/squircle.js";


  let {
    number,
    label,
    active = false,
    complete = false,
    disabled = false,
    onSelect,
  }: {
    number: number;
    label: string;
    active?: boolean;
    complete?: boolean;
    disabled?: boolean;
    onSelect: () => void;
  } = $props();

  let size = $state(0);
  const outerPath = $derived(
    createSquirclePath(size, SQUIRCLE_OUTER_PATH_INSET),
  );
  const innerPath = $derived(
    createSquirclePath(size, SQUIRCLE_INNER_PATH_INSET),
  );
</script>

<button
  type="button"
  class:active
  class:complete
  data-squircle-step
  aria-current={active ? "step" : undefined}
  {disabled}
  onclick={onSelect}
  bind:clientWidth={size}
>
  <svg class="base-outline" viewBox={`0 0 ${Math.max(size, 1)} ${Math.max(size, 1)}`} aria-hidden="true">
    <!--
      An opaque fill in the squircle's own shape. The button cannot carry it as a
      background, because a squircle is not a border-radius, so anything behind
      the page would otherwise show through the step. That matters now the
      backdrop carries artwork rather than a flat colour.
    -->
    <path d={outerPath} class="fill" stroke="none"></path>
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
  <svg
    class="active-highlight"
    class:visible={active}
    data-step-active-highlight
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
  <span class="number" data-squircle-step-number>{number}</span>
  <span class="label">{label}</span>
</button>

<style>
  button {
    position: relative;
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    padding: 0.55rem;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--setup-muted);
    cursor: pointer;
    font: inherit;
    font-family: var(--setup-heading-font);
    font-size: var(--setup-text-body);
    font-weight: 650;
    transition:
      color 350ms ease-in-out,
      opacity 350ms ease-in-out;
  }
  svg {
    position: absolute;
    z-index: 0;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
    pointer-events: none;
  }
  .base-outline {
    color: color-mix(in srgb, var(--setup-muted) 46%, transparent);
  }
  .fill {
    fill: var(--setup-base);
  }
  .active-highlight {
    color: var(--setup-accent);
    opacity: 0;
    transition: opacity 350ms ease-in-out;
  }
  .active-highlight.visible {
    opacity: 1;
  }
  .number,
  .label {
    position: relative;
    z-index: 1;
  }
  .number {
    color: var(--setup-accent);
    font-family: var(--setup-heading-font);
    font-size: 24px;
    font-weight: 600;
    line-height: 1;
  }
  .label {
    overflow: hidden;
    /* Sized from the tile rather than the page, so a name still has room
       inside it on a phone, where the tile is two thirds of what it is on a
       desktop. */
    font-size: clamp(0.625rem, calc(var(--step-size, 5.5rem) * 0.19), 1rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button:hover:not(:disabled),
  button.complete,
  button.active {
    color: var(--setup-text);
  }
  button.complete .base-outline {
    color: color-mix(in srgb, var(--setup-accent) 55%, transparent);
  }
  button:focus-visible .base-outline {
    color: var(--setup-accent);
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--setup-accent) 55%, transparent));
  }
  button:disabled {
    cursor: default;
    opacity: 0.5;
  }

  @media (prefers-reduced-motion: reduce) {
    button,
    .active-highlight {
      transition: none;
    }
  }
</style>
