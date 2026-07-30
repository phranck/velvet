<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="root" data-step-card>
  {@render children()}
</div>

<style>
  .root {
    overflow: clip;
    border-radius: 1rem;
    background: var(--setup-panel);
    box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(18px);
  }
</style>
