<script lang="ts">
  import * as PageFooter from "./page-footer";
  import { sectionsNamed } from "./site-sections.js";

  /**
   * The strip along the bottom of every velvet.li page.
   *
   * The arrangement itself lives in `page-footer`, which the onboarding shares.
   * What this adds is the site's own measure, so the credit lines up with the
   * bar at the top and the content between them rather than spanning the
   * window on its own, and the automatic margin that keeps it at the foot of a
   * page whose content does not fill the window.
   *
   * The site puts the credit at the left and the way onward at the right,
   * whilst the onboarding centres its credit and prints a serial there. Both
   * are the same three columns with different things in them, so the pieces are
   * composed here rather than the footer being given a setting.
   */

  /**
   * Which pages the foot leads to.
   *
   * Not every page the bar offers. Somebody who has read to the bottom of a
   * page is looking for what to read next, and References is a list of
   * installations rather than something to read. Named rather than sliced off
   * the bar's list, so reordering that list cannot silently change this one.
   */
  const ONWARD = sectionsNamed("documentation", "changelog", "attributions");
</script>

<div class="velvet-page">
  <PageFooter.Root>
    <PageFooter.Credit />
    <!--
      The way onward, where the mark used to sign the page. The bar at the top
      carries the mark as a link somebody can actually use, so repeating it here
      said the same thing twice and said nothing about where to go next.
    -->
    <nav class="onward" aria-label="Pages">
      <ul>
        {#each ONWARD as section (section.id)}
          <li><a href={section.href}>{section.label}</a></li>
        {/each}
      </ul>
    </nav>
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
     the way onward holds the last and a page signed at one end and continued at
     the other reads better than one signed in the centre. */
  div :global(.page-footer) {
    --page-footer-credit-column: 1;

    align-items: center;
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

  /* The last column, at its end, so the row meets the right-hand edge of the
     page measure the way the credit meets the left. */
  .onward {
    grid-column: 3;
    justify-self: end;
  }

  .onward ul {
    display: flex;
    /* Wraps on a narrow window rather than pushing the measure wider, and wraps
       towards the credit so the row keeps its right-hand edge. */
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.375rem 1.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The bar's own words, at the bar's own size. What differs is the resting
     colour: at the top of a page these are where a reader is going, and here
     they are what is left after they have read it. */
  .onward a {
    color: var(--velvet-text-dim);
    font-family: var(--velvet-font-label);
    font-size: var(--velvet-text-label);
    font-weight: 700;
    letter-spacing: var(--velvet-tracking-label);
    line-height: 1;
    text-transform: uppercase;
    text-decoration: none;
    transition: color var(--velvet-transition, 150ms ease);
  }

  .onward a:hover,
  .onward a:focus-visible {
    color: var(--velvet-text);
  }
</style>
