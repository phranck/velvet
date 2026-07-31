<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    onclose,
    children,
  }: { title: string; onclose: () => void; children?: Snippet } = $props();
</script>

<header>
  <div class="titles">
    <h1>{title}</h1>
    {#if children}<p class="detail">{@render children()}</p>{/if}
  </div>
  <button type="button" class="close" onclick={onclose} aria-label="Close">
    <i class="ph-duotone ph-x" aria-hidden="true"></i>
  </button>
</header>

<style>
  header {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--tool-line);
  }

  .titles {
    flex: 1;
    min-width: 0;
  }

  h1 {
    margin: 0;
    color: var(--tool-text);
    font-size: 15px;
    font-weight: 650;
  }

  .detail {
    margin: 0.25rem 0 0;
    color: var(--tool-muted);
    font-size: 13px;
  }

  .close i {
    font-size: 18px;
  }

  .close {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: var(--tool-panel-raised);
    color: inherit;
    cursor: pointer;
  }

  .close:hover {
    background: var(--tool-line);
  }

  /* The Configurator suppresses native focus rings globally and shows focus
     in its own accent instead, so this must match rather than fall back to
     currentColor, which reads as the browser default. */
  .close:focus-visible {
    outline: 2px solid var(--tool-accent);
    outline-offset: 2px;
  }
</style>
