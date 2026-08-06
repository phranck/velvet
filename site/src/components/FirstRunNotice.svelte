<script lang="ts">
  /**
   * Says that an empty page is what a new installation looks like.
   *
   * A page set up a minute ago reports every service operational and shows "No
   * data" against each of them, because availability is counted in whole days
   * and the first day has not happened. Both statements are true, and together
   * they read as something being broken.
   *
   * The page decides for itself when to stop saying this, which is the moment
   * any service has a day of history. Nothing has to remember to remove it and
   * nothing has to store when setup happened.
   */
  let {
    checkIntervalMinutes,
  }: {
    /**
     * How often the installed workflow checks, in minutes.
     *
     * Passed in rather than written here, because it is a property of the
     * workflow an installation runs. Stating a number this component chose
     * would be a guess about somebody else's repository.
     */
    checkIntervalMinutes: number;
  } = $props();
</script>

<aside class="first-run" aria-label="About this page">
  <p>
    <strong>Nothing has gone wrong.</strong> This is what a status page looks like
    on its first day. Your services have been checked and the result is above; what
    is missing is history, because availability is counted in whole days and the
    first one has not finished yet.
  </p>
  <p>
    Velvet checks again every {checkIntervalMinutes} minutes. The bars start filling
    as soon as there is a day to fill them with, and this notice goes away by itself.
  </p>
</aside>

<style>
  /* The accent rather than the warning colour. This says the page is working,
     and a reader who has just finished setting Velvet up should not meet
     something that reads as an incident. */
  .first-run {
    /* The inset the status page gives everything inside it, which is what
       makes this exactly as wide as the cards it introduces. It states no
       width of its own: the page already carries the configured measure, and a
       notice that read that measure directly came out a whole inset wider than
       the cards on both sides. */
    margin: 0 var(--status-content-inset) 1.25rem;
    padding: 0.9rem 1.1rem;
    border-radius: var(--card-radius, 14px);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--text);
  }
  p {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.55;
  }
  p + p {
    margin-top: 0.5rem;
    color: var(--text-muted);
  }
</style>
