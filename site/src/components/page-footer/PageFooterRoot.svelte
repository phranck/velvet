<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The strip along the bottom of a Velvet tool.
   *
   * Carries the arrangement and nothing about where it sits. The onboarding
   * pins its footer over a scrolling page whilst the website lets it end the
   * document, and that is a property of those pages rather than of a footer, so
   * each sets it on its own side. Composed from the pieces beside this rather
   * than switched by flags: a footer with a serial and one without are
   * different arrangements, not one arrangement with a setting.
   */
  let { children }: { children: Snippet } = $props();
</script>

<footer class="page-footer" data-page-footer>
  {@render children()}
</footer>

<style>
  .page-footer {
    min-height: 3rem;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.2rem;
    padding: var(--page-footer-padding, 0.5rem 1rem);
    color: var(--velvet-text-muted);
    box-sizing: border-box;
    font-size: var(--velvet-text-small);
  }
</style>
