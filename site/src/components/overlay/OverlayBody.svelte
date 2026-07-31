<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<!--
  A scrollable region must be focusable, otherwise a keyboard user cannot
  scroll it at all, which fails WCAG 2.1.1. The rule below assumes a
  non-interactive element never needs focus and does not know that exception.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="body" tabindex="0" role="region" aria-label="Content">
  {@render children()}
</div>

<style>
  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 1.5rem;
  }

  .body:focus-visible {
    outline: 2px solid var(--tool-accent);
    outline-offset: -2px;
  }
</style>
