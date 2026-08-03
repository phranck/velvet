<script lang="ts">
  import * as PageFooter from "./page-footer";

  /**
   * The strip along the bottom of every velvet.li page.
   *
   * The arrangement itself lives in `page-footer`, which the onboarding shares.
   * What this adds is the site's own measure, so the credit lines up with the
   * bar at the top and the content between them rather than spanning the
   * window on its own.
   */
</script>

<div class="velvet-page">
  <PageFooter.Root>
    <PageFooter.Credit />
  </PageFooter.Root>
</div>
