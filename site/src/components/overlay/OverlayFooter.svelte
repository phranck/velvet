<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<footer>{@render children()}</footer>

<style>
  footer {
    flex: 0 0 auto;
    display: flex;
    /* Actions sit to the right, matching the rest of the product. */
    justify-content: flex-end;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid rgb(255 255 255 / 0.1);
  }
</style>
