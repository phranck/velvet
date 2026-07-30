<script lang="ts">
  import { SQUIRCLE_PATH } from "../lib/squircle.js";

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
</script>

<button
  type="button"
  class:active
  class:complete
  data-squircle-step
  aria-current={active ? "step" : undefined}
  {disabled}
  onclick={onSelect}
>
  <svg class="outer-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path
      d={SQUIRCLE_PATH}
      fill="none"
      stroke="currentColor"
      stroke-width="1"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    ></path>
  </svg>
  <svg class="inner-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <path
      d={SQUIRCLE_PATH}
      fill="none"
      stroke="currentColor"
      stroke-width="4"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
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
    display: block;
    overflow: visible;
    color: color-mix(in srgb, var(--setup-muted) 46%, transparent);
    pointer-events: none;
  }
  .outer-frame {
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .inner-frame {
    inset: 4.5px;
    width: calc(100% - 9px);
    height: calc(100% - 9px);
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
