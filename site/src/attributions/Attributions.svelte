<script lang="ts">
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
    <div class="card">
      <ReleaseNotes source={lead} headings="outline" />
    </div>
  {/if}

  {#each sections as section (section.id)}
    <h2 id={section.id}>{section.title}</h2>
    <div class="card">
      <ReleaseNotes source={section.body} headings="outline" />
    </div>
  {/each}
</main>

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
  h1 {
    font-size: var(--velvet-text-title);
    line-height: 1.1;
    margin-block: 0 1rem;
  }
  .lede {
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-copy);
    margin-block: 0 2.5rem;
  }
  h2 {
    margin-block: 2.5rem 0.75rem;
    scroll-margin-top: 5.5rem;
    font-size: var(--velvet-text-heading);
    line-height: 1.2;
  }
  h2:first-of-type {
    margin-block-start: 0;
  }
  .card {
    --tool-text: var(--velvet-text);
    background: #14161d;
    border: 1px solid #222530;
    border-radius: var(--velvet-card-radius);
    padding: var(--velvet-card-padding);
    font-size: var(--velvet-text-body);
    line-height: 1.7;
  }
</style>
