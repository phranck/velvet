<script lang="ts">
  import * as Card from "../components/card";
  import * as TopicIndex from "../components/topic-index";
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

<div class="changelog velvet-page velvet-indexed-page">
  <TopicIndex.Root
    label="Releases"
    entries={releases.map(({ id, title, date }) => ({
      id,
      label: title,
      ...(date ? { detail: date } : {}),
    }))}
  />

  <main>
    <h1>Changelog</h1>
    <p class="lede">
      Every published Velvet release, newest first. This is the same document
      the repository carries, and the Configurator shows the notes for a release
      before installing it.
    </p>

    {#each releases as release (release.id)}
      <!-- The version above the card rather than inside it, so the releases
           read as a list of headings down the page with their notes beneath
           each, which is how the reference reads too. -->
      <h2 id={release.id} data-topic={release.id}>
        {release.title}
        {#if release.date}
          <span class="date">{release.date}</span>
        {/if}
      </h2>
      <Card.Root>
        <ReleaseNotes source={release.notes} />
      </Card.Root>
    {/each}
  </main>
</div>

<SiteFooter />

<style>
  /* Each of these introduces a card beneath it, so each begins half a radius
     in, where that card's curve gives way to its straight edge. */
  h1,
  .lede,
  main h2 {
    margin-inline: var(--velvet-card-text-inset);
  }
  main h2 {
    margin-block: 3.5rem 0.75rem;
    /* Clears the sticky bar, so following a release does not land its version
       underneath it. */
    scroll-margin-top: 5.5rem;
    font-size: var(--velvet-text-heading);
    line-height: 1.2;
  }
  /* Only where nothing stands in front of it, so the opening paragraph and the
     first release are not pressed together. */
  main h2:first-child {
    margin-block-start: 0;
  }
  /* Beside the version rather than under it, and quieter, because the version
     is what a reader is looking for and the day is what they check afterwards. */
  .date {
    margin-left: 0.75rem;
    color: var(--velvet-text-muted);
    font-family: var(--velvet-font);
    font-size: var(--velvet-text-body);
    font-weight: 400;
  }
</style>
