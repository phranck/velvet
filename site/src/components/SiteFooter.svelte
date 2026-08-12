<script lang="ts">
  import * as PageFooter from "./page-footer";

  /**
   * The strip along the bottom of every velvet.li page.
   *
   * The arrangement itself lives in `page-footer`, which the onboarding shares.
   * What this adds is the site's own measure, so the credit lines up with the
   * bar at the top and the content between them rather than spanning the
   * window on its own, and the automatic margin that keeps it at the foot of a
   * page whose content does not fill the window.
   *
   * The site puts the credit at the left and the mark at the right, whilst the
   * onboarding centres its credit and prints a serial at the right. Both are
   * the same three columns with different things in them, so the pieces are
   * composed here rather than the footer being given a setting.
   */
</script>

<div class="velvet-page">
  <PageFooter.Root>
    <PageFooter.Credit />
    <PageFooter.Mark />
  </PageFooter.Root>
</div>

<style>
  /* Claims whatever room is left in the column, which puts the credit at the
     bottom of the window on a short page and directly under the content on a
     long one. The page states the column and its height; this states only that
     the footer belongs at the end of it. */
  div {
    margin-block-start: auto;
  }
  /* The credit takes the first column here rather than the middle one, because
     the mark holds the last and a page signed at both ends reads better than
     one signed in the centre with a mark hanging off the side. */
  div :global(.page-footer) {
    --page-footer-credit-column: 1;

    align-items: flex-end;
    padding: 1.625rem 0;
    border-top: 1px solid var(--velvet-rule);
    color: var(--velvet-text-dim);
    /* A credit is a value rather than a sentence: who, and in which year. The
       figure face is what the rest of the site prints a value in. */
    font-family: var(--velvet-font-figure);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1;
  }
</style>
