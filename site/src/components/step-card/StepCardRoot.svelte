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
    box-shadow: var(--velvet-card-shadow);
    /* No backdrop filter. The surface is barely transparent so the board shows
       through it, and a blur behind it averages the traces into an even fog,
       which reads as an opaque card and undoes the transparency. */
    view-transition-name: onboarding-step-card-shell;
  }
</style>
