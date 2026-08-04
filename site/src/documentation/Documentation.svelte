<script lang="ts">
  import * as Card from "../components/card";
  import * as TopicIndex from "../components/topic-index";
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

<div class="documentation velvet-page velvet-indexed-page">
  <!--
    The topics, and nothing beneath them. A reference with sixty entries in its
    sidebar is a reference nobody scans, so only the level-two headings are
    listed.
  -->
  <TopicIndex.Root
    label="Topics"
    entries={sections.map(({ id, title }) => ({ id, label: title }))}
  />

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
        can be read and understood. Change it by hand
        <strong>only if you know exactly what you are doing</strong>. A
        configuration edited by hand can stop a status
        page from building or publishing, and an installation broken that way is
        not something Velvet can repair or answer for.
      </p>
    </aside>

    {#if lead}
      <Card.Root>
        <ReleaseNotes source={lead} headings="outline" copyable />
      </Card.Root>
    {/if}

    {#each sections as section (section.id)}
      <!-- The name above the card rather than inside it, so the topics read as
           a list of headings down the page with their content beneath each. -->
      <h2 id={section.id} data-topic={section.id}>{section.title}</h2>
      <Card.Root>
        <ReleaseNotes source={section.body} headings="outline" copyable />
      </Card.Root>
    {/each}
  </main>
</div>

<SiteFooter />

<style>
  /* Each of these introduces a card beneath it, so each begins half a radius
     in, where that card's curve gives way to its straight edge. Left at the
     page edge a heading sits out beyond the corner the card has already curved
     away from, and reads as hanging off the side of it.

     It does not line up with the text inside the card, and is not meant to:
     that text stands a further padding in. Measured at a 1440px window, a topic
     name sits at 440 and the first line under it at 451. */
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
  /* The same treatment a code word gets inside a card. A filename set in an
     opening paragraph is the same thing as a filename set in a reference, and
     it drew no background at all before, so the two read as different kinds of
     word on one page. */
  .lede code,
  .warning code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    padding: var(--velvet-code-inset);
    border-radius: var(--velvet-code-radius);
    background: var(--velvet-code-tint);
  }

  /* The one thing on this page that must not be read past. It carries the
     warning colour of the Velvet Default theme rather than a new one, on its
     own tinted surface, above the reference instead of inside it. */
  .warning {
    margin: 0 0 2.5rem;
    padding: var(--velvet-card-padding);
    border-radius: var(--velvet-card-radius);
    background: color-mix(in srgb, var(--velvet-degraded) 12%, var(--velvet-surface-card));
  }
  /* Text and headings take the further inset; nothing in this notice runs
     full width, so all of it does.

     Both rules below state `margin-block` rather than the `margin` shorthand,
     which sets all four sides and reset the inline margins this rule had just
     given them. Measured at a 1440px window: both sat at 445, the notice's
     padding edge, rather than at 461. */
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
    margin-block: 0 0.6rem;
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
    margin-block: 0 0.6rem;
    line-height: 1.55;
  }
  .warning p:last-child {
    margin-block-end: 0;
  }

  /* One card per topic, with the topic's name above it. The board backdrop is
     patterned, and several hundred lines of reference read directly over it are
     harder work than they need to be. */
  main h2 {
    margin-block: 3.5rem 0.75rem;
    /* Clears the sticky bar, so following a topic link does not land the
       heading underneath it. */
    scroll-margin-top: 5.5rem;
    font-size: var(--velvet-text-heading);
    line-height: 1.2;
  }
  /* Only where nothing stands in front of it. `:first-of-type` matched the
     first heading whatever preceded it, so the lead card and the first topic
     were pressed together. */
  main h2:first-child {
    margin-block-start: 0;
  }

  /* The document's own subheadings are its structure inside a topic, so they
     are given room the component does not assume, having been written for notes
     shown in a panel rather than a document read on its own. */
  main :global(h3) {
    margin-top: 1.5rem;
  }
</style>
