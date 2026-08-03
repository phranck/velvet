<script lang="ts">
  import * as Card from "../components/card";
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
    <Card.Root>
      <h2>{release.title}</h2>
      <ReleaseNotes source={release.notes} />
    </Card.Root>
  {/each}
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
  /* The gap between one release and the next. The card itself states no
     margin, because how far apart two of them stand is the page's business. */
  main :global(.card) {
    margin-block-end: 1.5rem;
  }
  /* Inside the card rather than beside one, so it meets the card's own curve
     and takes the inset the notes beneath it take. It sat 16px to the left of
     that prose before, at 141 against 157. */
  h2 {
    font-size: var(--velvet-text-heading);
    line-height: 1.2;
    margin: 0 var(--velvet-card-text-inset) 1rem;
  }
</style>
