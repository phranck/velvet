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
   */
</script>

<div class="velvet-page">
  <PageFooter.Root>
    <PageFooter.Credit />
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
</style>
