<script lang="ts">
  import type { Snippet } from "svelte";
  import {
    STEP_CARD_BUTTON_RADIUS,
    STEP_CARD_INNER_RADIUS,
    STEP_CARD_RADIUS,
  } from "./geometry.js";

  let { children }: { children: Snippet } = $props();

  const geometry = [
    `--step-card-radius: ${STEP_CARD_RADIUS}px`,
    `--step-card-inner-radius: ${STEP_CARD_INNER_RADIUS}px`,
    `--step-card-button-radius: ${STEP_CARD_BUTTON_RADIUS}px`,
  ].join("; ");
</script>

<div class="root" data-step-card style={geometry}>
  {@render children()}
</div>

<style>
  .root {
    position: relative;
    overflow: clip;
    border-radius: var(--step-card-radius);
    background: var(--setup-panel);
    /* Two layers rather than one. A single wide shadow dissolved into the board
       backdrop, leaving the card looking pasted on; the near layer draws its
       edge and the far one carries the height. */
    box-shadow:
      0 0.75rem 1.5rem rgba(0, 0, 0, 0.45),
      0 2rem 5rem rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(18px);
    view-transition-name: onboarding-step-card-shell;
  }
</style>
