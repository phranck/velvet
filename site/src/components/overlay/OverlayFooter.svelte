<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<footer>{@render children()}</footer>

<style>
  footer {
    flex: 0 0 auto;
    /* Paired actions share the width rather than sitting flush right. */
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    align-items: center;
    gap: 8px;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--tool-line);
  }
</style>
