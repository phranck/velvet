<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import type { Snippet } from "svelte";
  import type { TransitionConfig } from "svelte/transition";

  let {
    id,
    children,
  }: {
    id: string;
    children: Snippet;
  } = $props();

  function collapseServiceItem(node: HTMLElement): TransitionConfig {
    const style = getComputedStyle(node);
    const height = node.getBoundingClientRect().height;
    const marginBottom = Number.parseFloat(style.marginBottom);
    const reducedMotion =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    return {
      duration: reducedMotion ? 0 : 350,
      easing: cubicInOut,
      css: (t) => `
        height: ${t * height}px;
        margin-bottom: ${t * marginBottom}px;
        opacity: ${t};
        overflow: hidden;
        pointer-events: none;
      `,
    };
  }
</script>

<div
  class="service-editor-item"
  data-service-editor-item={id}
  out:collapseServiceItem|global
>
  {@render children()}
</div>

<style>
  .service-editor-item {
    margin-bottom: var(--service-editor-list-gap, 1rem);
    will-change: height, margin-bottom, opacity;
  }
</style>
