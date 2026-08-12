<script lang="ts">
  import * as Card from "../components/card";
  import SiteFooter from "../components/SiteFooter.svelte";
  import SiteHeader from "../components/SiteHeader.svelte";
  import ReleaseNotes from "../components/release-notes/ReleaseNotes.svelte";
  // The repository's own notices, read at build time. Nothing is copied here,
  // so what a visitor reads and what ships with an installation cannot come to
  // credit different people.
  import notices from "../../../THIRD_PARTY_NOTICES.md?raw";
  import { resolveRepositoryLinks } from "../lib/repository-links.js";
  import { splitIntoSections } from "../lib/markdown-sections.js";

  const { lead, sections } = splitIntoSections(
    resolveRepositoryLinks(notices.replace(/^#\s+.*\n/u, "")),
  );
</script>

<SiteHeader current="attributions" />

<main class="attributions velvet-page">
  <h1>Attributions</h1>
  <p class="lede">
    What Velvet is built from, and who made it. Every component and asset here
    keeps its own licence and its own notice, and this is the same document the
    status page Action copies into every generated site.
  </p>

  {#if lead}
    <Card.Root>
      <ReleaseNotes source={lead} headings="outline" />
    </Card.Root>
  {/if}

  {#each sections as section (section.id)}
    <h2 id={section.id}>{section.title}</h2>
    <Card.Root>
      <ReleaseNotes source={section.body} headings="outline" />
    </Card.Root>
  {/each}
</main>

<SiteFooter />

<style>
  .attributions {
    padding: 2.5rem 0 6rem;
  }
  /* Beside a card and on the same level as one, so the same inset applies. */
  h1,
  .lede,
  h2 {
    margin-inline: var(--velvet-card-text-inset);
  }
  h2 {
    margin-block: 3.5rem 0.75rem;
    scroll-margin-top: 5.5rem;
    font-size: var(--velvet-text-heading);
    line-height: 1.2;
  }
  /* Only where nothing stands in front of it. `:first-of-type` matched the
     first heading whatever preceded it, so the lead card and the first topic
     were pressed together. */
  h2:first-child {
    margin-block-start: 0;
  }
  /* The second column carries nothing but a version number or the date an asset
     was retrieved, and both are read as one value. A date breaks at its hyphens
     given the chance, and the column is narrow enough to take it: measured at
     95px, all three dates stood as `2026-` over `08-01`. */
  :global(td:nth-child(2)),
  :global(th:nth-child(2)) {
    white-space: nowrap;
  }
</style>
