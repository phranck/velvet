<script lang="ts">
  /**
   * Who made this, and when.
   *
   * The year is read here rather than passed in, because every caller would
   * otherwise compute the same thing and one of them would eventually stop.
   *
   * Placed in the middle column so it stays centred on the page however wide
   * whatever sits beside it happens to be.
   */
  const CURRENT_YEAR = new Date().getFullYear();
</script>

<span class="credit" data-page-footer-credit>
  <span>© {CURRENT_YEAR} by </span>
  <a href="https://layered.work" target="_blank" rel="noopener noreferrer">
    LAYERED
  </a>
</span>

<style>
  .credit {
    grid-column: 2;
    display: flex;
    align-items: center;
    gap: 0.2rem;
  }
  .credit a {
    color: var(--velvet-text);
    font-weight: 650;
    text-decoration: none;
  }
  .credit a:focus-visible {
    outline: 2px solid var(--velvet-accent);
    outline-offset: 3px;
  }
</style>
