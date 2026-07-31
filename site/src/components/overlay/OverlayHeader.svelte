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
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        fill="none"
      />
    </svg>
  </button>
</header>

<style>
  header {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid rgb(255 255 255 / 0.1);
  }

  .titles {
    flex: 1;
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 640;
    letter-spacing: -0.01em;
  }

  .detail {
    margin: 0.25rem 0 0;
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .close {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: none;
    border-radius: 0.5rem;
    background: rgb(255 255 255 / 0.08);
    color: inherit;
    cursor: pointer;
  }

  .close:hover {
    background: rgb(255 255 255 / 0.14);
  }

  .close:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
</style>
