<script lang="ts">
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

<main class="changelog column">
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

<style>
  .changelog {
    margin: 0 auto;
    max-width: 48rem;
    padding: 3rem clamp(1rem, 5vw, 4rem) 6rem;
  }
  h1 {
    font-size: clamp(2rem, 6vw, 3rem);
    line-height: 1.1;
    margin: 0 0 1rem;
  }
  .lede {
    color: var(--velvet-muted, #9aa3b2);
    font-size: 1.125rem;
    margin: 0 0 3rem;
    max-width: 34rem;
  }
  article {
    background: #14161d;
    border: 1px solid #222530;
    border-radius: 0.75rem;
    margin: 0 0 1.5rem;
    padding: 1.5rem 1.75rem;
  }
  h2 {
    font-size: 1.5rem;
    line-height: 1.2;
    margin: 0 0 1rem;
  }
  .source-note {
    border-top: 1px solid #222530;
    color: var(--velvet-muted, #9aa3b2);
    font-size: 0.9375rem;
    margin: 1.5rem 0 0;
    max-width: 34rem;
    padding-top: 1.5rem;
  }
</style>
