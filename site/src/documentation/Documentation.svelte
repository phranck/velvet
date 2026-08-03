<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import SiteFooter from "../components/SiteFooter.svelte";
  import SiteHeader from "../components/SiteHeader.svelte";
  import ReleaseNotes from "../components/release-notes/ReleaseNotes.svelte";
  // The repository's own configuration reference, read at build time. The page
  // is prerendered, so this file is baked into the published document and a
  // visitor downloads no script to read it.
  import reference from "../../../documentation/configuration.md?raw";
  import { resolveRepositoryLinks } from "../lib/repository-links.js";
  import { splitIntoSections } from "../lib/markdown-sections.js";

  /**
   * The reference without its own title, cut into its topics.
   *
   * The document opens with a level-one heading, and so does this page. Keeping
   * both would print the same thing twice and give the page two level-one
   * headings, which is one more than a document may have.
   *
   * Each topic becomes a card with its name above it, and the sidebar lists
   * exactly those names, so what a reader sees on the left is what they can
   * land on.
   */
  const { lead, sections } = splitIntoSections(
    resolveRepositoryLinks(reference.replace(/^#\s+.*\n/u, ""), "documentation/"),
  );
</script>

<SiteHeader current="documentation" />

<div class="documentation velvet-page">
  <!--
    The topics, and nothing beneath them. A reference with sixty entries in its
    sidebar is a reference nobody scans, so only the level-two headings are
    listed.
  -->
  <aside class="topics" aria-label="Topics">
    <nav>
      <ul>
        {#each sections as section (section.id)}
          <li>
            <a href={`#${section.id}`} data-topic-link={section.id}>
              {section.title}
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  </aside>

  <main>
    <h1>Configuration</h1>
    <p class="lede">
      Every option <code>velvet.yml</code> accepts, from a one-service website to
      themes, incidents, retention, and managed updates. This is the reference the
      repository carries, and it is also available offline as
      <code>man velvet.yml</code>.
    </p>

    <!--
      Above the reference and set apart from it. A reference read without this
      reads as an invitation to edit the file it describes, which is not the
      path Velvet supports and is the one way an installation breaks in a manner
      nobody can repair for its owner.
    -->
    <aside class="warning" aria-labelledby="warning-title">
      <div class="warning-head">
        <Icon name="danger" />
        <h2 id="warning-title">Editing this file by hand is not the supported path</h2>
      </div>
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
    </aside>

    {#if lead}
      <div class="card reference">
        <ReleaseNotes source={lead} headings="outline" copyable />
      </div>
    {/if}

    {#each sections as section (section.id)}
      <!-- The name above the card rather than inside it, so the topics read as
           a list of headings down the page with their content beneath each. -->
      <h2 id={section.id} data-topic={section.id}>{section.title}</h2>
      <div class="card reference">
        <ReleaseNotes source={section.body} headings="outline" copyable />
      </div>
    {/each}
  </main>
</div>

<SiteFooter />

<style>
  /* The topics on the left and the reference on the right, from the width at
     which a sidebar leaves the reference enough room for its four-column
     tables. Below that the topics come first and the page reads in one column.
     The site's own measure is shared with the header and the footer. */
  .documentation {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2.5rem;
    padding: 2.5rem 0 6rem;
  }
  @media (min-width: 960px) {
    .documentation {
      grid-template-columns: 16rem minmax(0, 1fr);
      gap: 3rem;
    }
  }

  /* Pinned below the bar rather than at the top of the window, because the bar
     is what sits there. It never scrolls out of the top, and scrolls within
     itself once the list is taller than what is left of the window. */
  /* On the same surface the topics themselves sit on, so the list reads as
     one panel rather than as links loose on the backdrop. */
  .topics {
    align-self: start;
    padding: var(--velvet-card-padding);
    border: 1px solid #222530;
    border-radius: var(--velvet-card-radius);
    background: #14161d;
  }
  @media (min-width: 960px) {
    .topics {
      position: sticky;
      top: 5.75rem;
      max-height: calc(100vh - 7.5rem);
      overflow-y: auto;
    }
  }
  .topics ul {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .topics a {
    display: block;
    padding: 0.25rem var(--velvet-card-text-inset);
    border-radius: 0.5rem;
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-body);
    line-height: 1.45;
    text-decoration: none;
  }
  .topics a:hover,
  .topics a:focus-visible {
    color: var(--velvet-text);
  }
  /* The topic a reader is looking at. Marked by a script in the page, so the
     rule is global or Svelte finds no element carrying the attribute and
     removes it as unused. */
  .topics a:global([data-current]) {
    color: var(--velvet-accent);
    background: color-mix(in srgb, var(--velvet-accent) 10%, transparent);
  }

  /* Text and headings standing beside a card, on the same level as one, take
     the same horizontal inset the text inside it takes, so a topic's name
     lines up with the first line beneath it rather than sitting proud of it. */
  h1,
  .lede,
  main h2 {
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
  .lede code {
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  /* The one thing on this page that must not be read past. It carries the
     warning colour of the Velvet Default theme rather than a new one, on its
     own tinted surface, above the reference instead of inside it. */
  .warning {
    margin: 0 0 2.5rem;
    padding: var(--velvet-card-padding);
    border: 1px solid color-mix(in srgb, #d29922 45%, transparent);
    border-radius: var(--velvet-card-radius);
    background: color-mix(in srgb, #d29922 12%, #14161d);
  }
  /* Text and headings take the further inset; nothing in this notice runs
     full width, so all of it does. */
  .warning-head,
  .warning p {
    margin-inline: var(--velvet-card-text-inset);
  }
  /* The mark and the heading share a row, which is what puts them on the same
     centre line. Held apart, the mark aligned to the top of a two-line heading
     and read as sitting above it. */
  .warning-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0 0 0.6rem;
  }
  .warning :global(svg) {
    color: #d29922;
    width: var(--velvet-text-intro);
    height: var(--velvet-text-intro);
  }
  .warning h2 {
    margin: 0;
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

  /* One card per topic, with the topic's name above it. The board backdrop is
     patterned, and several hundred lines of reference read directly over it are
     harder work than they need to be. */
  main h2 {
    margin-block: 2.5rem 0.75rem;
    /* Clears the sticky bar, so following a topic link does not land the
       heading underneath it. */
    scroll-margin-top: 5.5rem;
    font-size: var(--velvet-text-heading);
    line-height: 1.2;
  }
  main h2:first-of-type {
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
  /* The document's own subheadings are its structure inside a topic, so they
     are given room the component does not assume, having been written for notes
     shown in a panel rather than a document read on its own. */
  .reference :global(h3) {
    margin-top: 1.5rem;
    font-size: var(--velvet-text-copy);
  }
</style>
