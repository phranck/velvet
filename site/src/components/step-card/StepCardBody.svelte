<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    active,
    labelledBy,
    children,
  }: {
    active: boolean;
    labelledBy: string;
    children: Snippet;
  } = $props();
</script>

<section
  class="body"
  class:active
  hidden={!active}
  aria-labelledby={labelledBy}
  data-step-card-body
>
  {@render children()}
</section>

<style>
  .body {
    min-height: 27rem;
    padding: clamp(1.25rem, 4vw, 2.4rem);
    box-sizing: border-box;
  }
  .body[hidden] {
    display: none;
  }
</style>
