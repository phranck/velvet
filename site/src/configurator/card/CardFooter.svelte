<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * The bottom of a card, where what closes or confirms it stands.
   *
   * Set off by a rule rather than by a surface of its own, because a second
   * surface inside a card reads as a second card.
   */
  let { children }: { children: Snippet } = $props();
</script>

<footer class="card__footer">
  {@render children()}
</footer>

<style>
  .card__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: var(--configurator-inset);
    padding-inline: calc(var(--configurator-inset) + var(--configurator-text-inset));
    border-top: 1px solid var(--configurator-divider);
  }
</style>
