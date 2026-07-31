<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<dl class="review-list" data-review-list>
  {@render children()}
</dl>

<style>
  .review-list {
    width: min(100%, 44rem);
    display: grid;
    gap: 0.65rem;
    margin: 0 auto;
  }
</style>
