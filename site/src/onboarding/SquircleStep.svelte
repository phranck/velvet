<script lang="ts">
  import { createSquircleRectPath } from "../lib/squircle.js";

  const CORNER_RADIUS = 24;
  const OUTER_PATH_INSET = 1;
  const INNER_PATH_INSET = 5.5;

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

  let width = $state(0);
  let height = $state(0);
  const outerPath = $derived(
    createSquircleRectPath(width, height, CORNER_RADIUS, OUTER_PATH_INSET),
  );
  const innerPath = $derived(
    createSquircleRectPath(width, height, CORNER_RADIUS, INNER_PATH_INSET),
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
  bind:clientWidth={width}
  bind:clientHeight={height}
>
  <svg viewBox={`0 0 ${Math.max(width, 1)} ${Math.max(height, 1)}`} aria-hidden="true">
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
    height: 84px;
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
    font-size: var(--setup-text-body);
    font-weight: 650;
  }
  svg {
    position: absolute;
    z-index: 0;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
    color: color-mix(in srgb, var(--setup-muted) 46%, transparent);
    pointer-events: none;
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
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  button:hover:not(:disabled),
  button.complete,
  button.active {
    color: var(--setup-text);
  }
  button.active svg {
    color: var(--setup-accent);
  }
  button.complete svg {
    color: color-mix(in srgb, var(--setup-accent) 55%, transparent);
  }
  button:focus-visible svg {
    color: var(--setup-accent);
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--setup-accent) 55%, transparent));
  }
  button:disabled {
    cursor: default;
    opacity: 0.5;
  }
</style>
