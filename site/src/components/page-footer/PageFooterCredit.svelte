<script lang="ts">
  /**
   * Who made this, and when.
   *
   * The year is read here rather than passed in, because every caller would
   * otherwise compute the same thing and one of them would eventually stop.
   *
   * The middle column by default, so it stays centred on the page however wide
   * whatever sits beside it happens to be. An arrangement that puts something
   * else in the middle names a different column from its own side, which is a
   * placement rather than a setting: the credit itself is unchanged either way.
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
  /* One line of text rather than a row of two boxes, so the space before the
     name is the same space that stands between every other pair of words here.
     As a flex row it was a `gap` instead, and a gap is a length: at 0.2rem it
     measured 3.2px whilst a space in this face measures 8.4, and the name sat
     visibly closer to `by` than `by` did to `2026`. No length gets this right
     for long, because the face is chosen elsewhere and a space is as wide as
     that face says. */
  .credit {
    grid-column: var(--page-footer-credit-column, 2);
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
