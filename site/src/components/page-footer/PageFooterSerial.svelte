<script lang="ts">
  /**
   * The installation's running number, printed as a board prints a unit number.
   *
   * Announced politely, because it arrives after the page has been read: the
   * onboarding asks the service which number comes next and fills it in when
   * the answer lands.
   *
   * @param label - The number, already padded. Absent means no registry
   *   answered, and then nothing is rendered rather than a placeholder.
   */
  let { label }: { label: string } = $props();
</script>

{#if label}
  <p class="serial" aria-live="polite" data-footer-serial>
    <span>Serial</span>
    <span class="number">#{label}</span>
  </p>
{/if}

<style>
  .serial {
    grid-column: 3;
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    color: var(--velvet-text-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--setup-text-caption, 0.8125rem);
    font-weight: 700;
    letter-spacing: 0.06em;
    user-select: none;
  }
  /* Inverted, the way a board prints a value meant to be read rather than
     skimmed. */
  .number {
    padding: 0.05rem 0.35rem;
    border-radius: 0.15rem;
    background: color-mix(in srgb, var(--velvet-text-muted) 70%, transparent);
    color: var(--velvet-base);
  }
</style>
