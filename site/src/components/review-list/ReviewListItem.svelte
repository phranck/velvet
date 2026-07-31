<script lang="ts">
  import { createSquirclePath } from "../../lib/squircle.js";

  const OUTER_PATH_INSET = 1;
  const INNER_PATH_INSET = 5.5;

  let {
    label,
    value,
    icon,
  }: {
    label: string;
    value: string | number;
    icon: string;
  } = $props();

  let size = $state(0);
  const outerPath = $derived(createSquirclePath(size, OUTER_PATH_INSET));
  const innerPath = $derived(createSquirclePath(size, INNER_PATH_INSET));
</script>

<div class="review-item" data-review-item>
  <div
    class="review-squircle"
    data-review-squircle
    aria-hidden="true"
    bind:clientWidth={size}
  >
    <svg viewBox={`0 0 ${Math.max(size, 1)} ${Math.max(size, 1)}`}>
      <path
        class="outer-outline"
        d={outerPath}
        fill="none"
        stroke="currentColor"
        stroke-width="1"
        stroke-linejoin="round"
      ></path>
      <path
        class="inner-outline"
        d={innerPath}
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        stroke-linejoin="round"
      ></path>
    </svg>
    <i class={`ph-duotone ${icon}`} aria-hidden="true"></i>
  </div>
  <div class="review-card" data-review-card>
    <div class="review-copy">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  </div>
</div>

<style>
  .review-item {
    min-width: 0;
    display: grid;
    grid-template-columns: 3.75rem minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
  }
  .review-item .review-squircle {
    position: relative;
    width: 3.75rem;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    color: var(--setup-muted);
  }
  .review-item .review-squircle > svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
    pointer-events: none;
  }
  .review-item .outer-outline {
    opacity: 0.32;
  }
  .review-item .inner-outline {
    opacity: 0.78;
  }
  .review-item .review-squircle > i {
    position: relative;
    z-index: 1;
    color: var(--setup-text);
    font-size: 1.4rem;
  }
  .review-item .review-card {
    position: relative;
    isolation: isolate;
    min-width: 0;
    min-height: 4.5rem;
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    border: 0;
    border-radius: var(--review-card-radius, 0.8rem);
    background: transparent;
    box-sizing: border-box;
  }
  .review-item .review-card::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: 0;
    border-radius: inherit;
    background: var(--setup-card);
    -webkit-mask-image: linear-gradient(
      90deg,
      #000 0%,
      #000 80%,
      transparent 100%
    );
    mask-image: linear-gradient(
      90deg,
      #000 0%,
      #000 80%,
      transparent 100%
    );
  }
  .review-item .review-copy {
    position: relative;
    z-index: 1;
    min-width: 0;
    display: grid;
    gap: 0.18rem;
  }
  .review-item dt {
    color: var(--setup-muted);
    font-size: var(--setup-text-small);
    letter-spacing: 0.055em;
    line-height: 1.2;
    text-transform: uppercase;
  }
  .review-item dd {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--setup-text);
    font-family: var(--setup-heading-font);
    font-size: 1.25rem;
    font-weight: 600;
    letter-spacing: 0.01em;
    line-height: 1.15;
  }
</style>
