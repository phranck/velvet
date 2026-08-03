<script lang="ts">
  import SiteHeader from "../components/SiteHeader.svelte";
  import ReleaseNotes from "../components/release-notes/ReleaseNotes.svelte";
  // The repository's own configuration reference, read at build time. The page
  // is prerendered, so this file is baked into the published document and a
  // visitor downloads no script to read it.
  import reference from "../../../documentation/configuration.md?raw";
  import { resolveRepositoryLinks } from "../lib/repository-links.js";

  /**
   * The reference without its own title.
   *
   * The document opens with a level-one heading, and so does this page. Keeping
   * both would print the same thing twice and give the page two level-one
   * headings, which is one more than a document may have.
   */
  const body = resolveRepositoryLinks(
    reference.replace(/^#\s+.*\n/u, ""),
    "documentation/",
  );
</script>

<SiteHeader current="documentation" />

<main class="documentation velvet-page">
  <h1>Configuration</h1>
  <p class="lede">
    Every option <code>velvet.yml</code> accepts, from a one-service website to
    themes, incidents, retention, and managed updates. This is the reference the
    repository carries, and it is also available offline as
    <code>man velvet.yml</code>.
  </p>

  <!--
    Above the reference and set apart from it. A reference read without this
    reads as an invitation to edit the file it describes, which is not the path
    Velvet supports and is the one way an installation breaks in a manner
    nobody can repair for its owner.
  -->
  <aside class="warning" aria-labelledby="warning-title">
    <i class="ph-duotone ph-warning-diamond" aria-hidden="true"></i>
    <div>
      <h2 id="warning-title">Editing this file by hand is not the supported path</h2>
      <p>
        Velvet writes and updates <code>velvet.yml</code> through the
        Configurator, which validates every change before it reaches your
        repository. That is the only supported way to change it.
      </p>
      <p>
        What follows describes what the file contains, so that an installation
        can be read and understood. Change it by hand only if you know exactly
        what you are doing. A configuration edited by hand can stop a status
        page from building or publishing, and an installation broken that way is
        not something Velvet can repair or answer for.
      </p>
    </div>
  </aside>

  <div class="reference">
    <ReleaseNotes source={body} headings="outline" copyable />
  </div>
</main>

<style>
  /* Wider than the references and changelog pages, because the reference is
     built out of four-column tables and a 48rem column makes every one of them
     scroll sideways. */
  /* The site's own measure, shared with the header and the footer. */
  .documentation {
    padding: 3rem 0 6rem;
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
  .lede code {
    font-family: var(--font-mono);
    font-size: 0.9em;
  }
  /* The one thing on this page that must not be read past. It carries the
     warning colour of the Velvet Default theme rather than a new one, on its
     own tinted surface, above the reference instead of inside it. */
  .warning {
    display: flex;
    align-items: start;
    gap: 1rem;
    margin: 0 0 2rem;
    padding: 1.25rem 1.5rem;
    border: 1px solid color-mix(in srgb, #d29922 45%, transparent);
    border-radius: 0.75rem;
    background: color-mix(in srgb, #d29922 12%, #14161d);
  }
  .warning i {
    flex: none;
    color: #d29922;
    font-size: var(--velvet-text-ornament);
    line-height: 1.2;
  }
  .warning h2 {
    margin: 0 0 0.5rem;
    color: #d29922;
    font-size: var(--velvet-text-heading);
    line-height: 1.2;
  }
  .warning p {
    margin: 0 0 0.6rem;
    line-height: 1.55;
  }
  .warning p:last-child {
    margin-bottom: 0;
  }
  .warning code {
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  /* On its own surface, the same one the changelog gives a release. The board
     backdrop is patterned, and several hundred lines of reference read directly
     over it are harder work than they need to be.

     The document's own headings are also its structure, so they are given room
     the component does not assume, having been written for notes shown in a
     panel rather than a document read on its own. */
  .reference {
    --tool-text: var(--velvet-text);
    background: #14161d;
    border: 1px solid #222530;
    border-radius: 0.75rem;
    padding: 2rem clamp(1.25rem, 4vw, 2.5rem);
    font-size: var(--velvet-text-body);
    line-height: 1.7;
  }
  .reference :global(h2) {
    margin-top: 2.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid #222530;
    font-size: var(--velvet-text-heading);
  }
  .reference :global(h3) {
    margin-top: 1.5rem;
    font-size: var(--velvet-text-copy);
  }
</style>
