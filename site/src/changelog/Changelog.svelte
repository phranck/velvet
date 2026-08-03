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
  /* Beside a card and on the same level as one, so the same inset applies. */
  h1,
  .lede,
  .source-note {
    margin-inline: var(--velvet-card-text-inset);
  }
  h1 {
    font-size: var(--velvet-text-title);
    line-height: 1.1;
    margin: 0 0 1rem;
  }
  .lede {
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-copy);
    margin: 0 0 3rem;
  }
  article {
    background: #14161d;
    border: 1px solid #222530;
    border-radius: var(--velvet-card-radius);
    margin: 0 0 1.5rem;
    padding: var(--velvet-card-padding);
  }
  h2 {
    font-size: var(--velvet-text-heading);
    line-height: 1.2;
    margin: 0 0 1rem;
  }
  .source-note {
    border-top: 1px solid #222530;
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-small);
    margin: 1.5rem 0 0;
    padding-top: 1.5rem;
  }
</style>
