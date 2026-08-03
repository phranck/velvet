<script lang="ts">
  import SiteFooter from "../components/SiteFooter.svelte";
  import SiteHeader from "../components/SiteHeader.svelte";
  import ReleaseNotes from "../components/release-notes/ReleaseNotes.svelte";
  // Read from the repository's own changelog at build time. The page is
  // prerendered, so this file is baked into the published document and the
  // visitor downloads no script to see it.
  import changelogSource from "../../../CHANGELOG.md?raw";
  import { parseChangelog } from "./changelog.js";

  const releases = parseChangelog(changelogSource);
</script>

<SiteHeader current="changelog" />

<main class="changelog velvet-page">
  <h1>Changelog</h1>
  <p class="lede">
    Every published Velvet release, newest first. This is the same document the
    repository carries, and the Configurator shows the notes for a release
    before installing it.
  </p>

  {#each releases as release (release.title)}
    <article>
      <h2>{release.title}</h2>
      <ReleaseNotes source={release.notes} />
    </article>
  {/each}

  <p class="source-note">
    Velvet installs new releases for you. A security release that needs no
    migration can install itself, which is on by default and can be turned off
    in the Configurator, and everything else waits for you.
  </p>
</main>

<SiteFooter />

<style>
  /* The site's own measure, shared with the header and the footer. */
  .changelog {
    padding: 3rem 0 6rem;
  }
  /* Both introduce the cards beneath them, so both take the inset the text
     inside those cards takes.

     Every rule below states `margin-block` rather than the `margin` shorthand.
     The shorthand sets all four sides, so it reset the inline margins this rule
     had just given them, and the inset was thrown away without a trace of it in
     the markup. Measured at a 1440px window: both sat at 120, the page edge. */
  h1,
  .lede {
    margin-inline: var(--velvet-card-text-inset);
  }
  h1 {
    font-size: var(--velvet-text-title);
    line-height: 1.1;
    margin-block: 0 1rem;
  }
  .lede {
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-copy);
    margin-block: 0 3rem;
  }
  article {
    background: #14161d;
    border: 1px solid #222530;
    border-radius: var(--velvet-card-radius);
    margin: 0 0 1.5rem;
    padding: var(--velvet-card-padding);
  }
  /* Inside the card rather than beside one, so it meets the card's own curve
     and takes the inset the notes beneath it take. It sat 16px to the left of
     that prose before, at 141 against 157. */
  h2 {
    font-size: var(--velvet-text-heading);
    line-height: 1.2;
    margin: 0 var(--velvet-card-text-inset) 1rem;
  }
  /* Closes the page with nothing beneath it. There is no card here to line up
     with, so it sits at the page measure, and its rule runs the full width of
     that measure rather than stopping short of it on both sides. */
  .source-note {
    border-top: 1px solid #222530;
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-small);
    margin: 1.5rem 0 0;
    padding-top: 1.5rem;
  }
</style>
