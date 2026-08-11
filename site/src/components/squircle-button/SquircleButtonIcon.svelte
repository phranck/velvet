<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The picture above a squircle button's label.
   *
   * It is hidden from anything that reads the page aloud, because the button
   * already carries its own label and a glyph announced beside it would be the
   * same thing said twice.
   *
   * @param children - The icon, ordinarily an `Icon` or a Phosphor glyph.
   */
  let { children }: { children: Snippet } = $props();
</script>

<span class="icon" aria-hidden="true">{@render children()}</span>

<style>
  .icon {
    display: grid;
    place-items: center;
    /* Derived from the label rather than stated, because the two are one
       decision: a key with a picture on it, where the picture is what carries
       it and the word underneath names it. */
    font-size: calc(var(--squircle-button-label-size) * 1.9);
    line-height: 1;
  }

  .icon :global(svg) {
    width: calc(var(--squircle-button-label-size) * 1.9);
    height: calc(var(--squircle-button-label-size) * 1.9);
  }
</style>
