<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The word under a squircle button's icon.
   *
   * One word, or two at most. The button states what it does in full through
   * its own label, which is what a screen reader announces; this is what a
   * reader sees on the key.
   *
   * @param children - The word.
   */
  let { children }: { children: Snippet } = $props();
</script>

<span class="label">{@render children()}</span>

<style>
  .label {
    font-size: var(--squircle-button-label-size);
    /* Broken between words rather than inside one, so a longer label makes a
       second line instead of a hyphen nobody asked for. */
    overflow-wrap: break-word;
  }
</style>
