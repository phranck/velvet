<script lang="ts">
  import {
    parseReleaseNotes,
    type ReleaseNotesHeadings,
    type ReleaseNotesInline,
  } from "../../lib/release-notes.js";
  import CodeBlock from "../CodeBlock.svelte";
  import Icon from "../Icon.svelte";

  let {
    source,
    /**
     * Which heading arrangement the surrounding page needs. The default is what
     * the Configurator's overlay has always shown, because that panel supplies
     * the only level-one heading and a note may not add depth beneath it. A
     * page rendering a whole document asks for `outline` instead.
     */
    headings = "flattened",
    /**
     * Whether each code block carries a button that copies it. Off by default,
     * because the button is wired by a script in the page rather than by this
     * component, and a surface that does not carry that script would show a
     * control that does nothing.
     */
    copyable = false,
  }: {
    source: string;
    headings?: ReleaseNotesHeadings;
    copyable?: boolean;
  } = $props();

  const blocks = $derived(parseReleaseNotes(source, { headings }));
</script>

<!--
  Every part is rendered through a normal element. There is deliberately no
  `{@html}` in this component, so markup embedded in a release note has no
  route to the DOM at all.
-->
{#snippet inline(parts: ReleaseNotesInline[])}
  {#each parts as part, index (index)}
    {#if part.kind === "strong"}
      <strong>{part.value}</strong>
    {:else if part.kind === "emphasis"}
      <em>{part.value}</em>
    {:else if part.kind === "code"}
      <code>{part.value}</code>
    {:else if part.kind === "link"}
      <!-- Every link here leaves for a new tab, so it says so. Left unmarked,
           a reader only discovers it after the tab has opened. -->
      <a href={part.href} target="_blank" rel="noreferrer noopener">
        {part.value}<Icon name="export-arrow-01" class="leaves" />
      </a>
    {:else}
      {part.value}
    {/if}
  {/each}
{/snippet}

<div class="notes">
  {#each blocks as block, index (index)}
    {#if block.kind === "heading" && block.level === 2}
      <h2>{@render inline(block.content)}</h2>
    {:else if block.kind === "heading"}
      <h3>{@render inline(block.content)}</h3>
    {:else if block.kind === "paragraph"}
      <p>{@render inline(block.content)}</p>
    {:else if block.kind === "code"}
      <CodeBlock
        code={block.value}
        language={block.language}
        {copyable}
        label="Copy this configuration"
      />
    {:else if block.kind === "table"}
      <!-- Wrapped, because a reference table is wider than a phone and the
           alternative is either a squeezed column or a page that scrolls
           sideways as a whole. -->
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              {#each block.headers as header, headerIndex (headerIndex)}
                <th scope="col">{@render inline(header)}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each block.rows as row, rowIndex (rowIndex)}
              <tr>
                {#each row as cell, cellIndex (cellIndex)}
                  <td>{@render inline(cell)}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if block.ordered}
      <ol>
        {#each block.items as item, itemIndex (itemIndex)}
          <li>{@render inline(item)}</li>
        {/each}
      </ol>
    {:else}
      <ul>
        {#each block.items as item, itemIndex (itemIndex)}
          <li>{@render inline(item)}</li>
        {/each}
      </ul>
    {/if}
  {/each}
</div>

<style>
  .notes {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: var(--tool-text, inherit);
    line-height: 1.6;
    overflow-wrap: break-word;
  }

  /* Text and headings take a further horizontal inset of half the card's
     corner radius, because the rounding eats into the corner of the content
     box and a line flush against that edge collides with the curve. A code
     block and a table run full width and keep the padding edge, which is why
     the inset is applied here rather than to the container.

     Nothing when the surface defines no card geometry, which is the case in
     the Configurator's overlay. */
  h2,
  h3,
  p,
  ul,
  ol {
    margin-inline: var(--velvet-card-text-inset, 0);
  }

  h2,
  h3 {
    margin-block: 0;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  /* Relative to the text they introduce, not to a size of their own. These
     notes are rendered on two surfaces which set different body sizes, and a
     heading fixed in pixels beside text sized elsewhere ends up smaller than
     its own paragraphs, which is what it did in the Configurator's overlay.
     A page rendering a whole document states its scale through the two
     properties and takes these only where it does not. */
  h2 {
    font-size: var(--notes-heading-size, 1.35em);
    font-weight: 650;
  }

  h3 {
    font-size: var(--notes-subheading-size, 1.1em);
    font-weight: 650;
  }

  h2:not(:first-child),
  h3:not(:first-child) {
    margin-block-start: 0.5rem;
  }

  p {
    margin-block: 0;
  }

  ul,
  ol {
    margin-block: 0;
    padding-inline-start: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  code {
    /* The token already carries its own fallbacks, so nothing is repeated
       after it. The fallback here is for a surface that defines no token. */
    font-family: var(--font-mono);
    font-size: 0.875em;
    padding: var(--velvet-code-inset, 0.125em 0.375em);
    border-radius: var(--velvet-code-radius, 0.25rem);
    background: var(--velvet-code-tint, color-mix(in srgb, currentColor 10%, transparent));
  }

  /* The scroll lives on this wrapper rather than the table, because a table is
     sized by its contents and would report that width to everything above it,
     widening the page instead of scrolling inside it.

     It reaches past the card's padding to both edges, so a banded row and the
     band under the pointer run the full width of the card rather than floating
     inside it. The padding comes back on the outermost cells, and with the
     text inset added, so the first column still lines up with the prose above
     it. Nothing when the surface states no card geometry. */
  .table-scroll {
    overflow-x: auto;
    margin-inline: calc(var(--velvet-card-padding, 0px) * -1);
  }
  th:first-child,
  td:first-child {
    padding-left: calc(
      var(--velvet-card-padding, 0px) + var(--velvet-card-text-inset, 0.75rem)
    );
  }
  th:last-child,
  td:last-child {
    padding-right: calc(var(--velvet-card-padding, 0px) + 0.75rem);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9375em;
    text-align: left;
  }
  th,
  td {
    padding: 0.5rem 0.75rem;
    vertical-align: top;
  }
  /* The label face, as everywhere else on the site that names a thing rather
     than saying it. A column heading is not prose, and setting it apart by
     weight alone left it reading as the first row of the table. */
  th {
    color: var(--velvet-accent);
    font-family: var(--velvet-font-label);
    font-size: var(--velvet-text-label-small, 0.6875rem);
    font-weight: 700;
    letter-spacing: var(--velvet-tracking-eyebrow, 0.16em);
    text-transform: uppercase;
    white-space: nowrap;
  }
  /* Banded rather than ruled. A rule between every row draws as many lines as
     there are entries, which is more structure than a reader needs to follow
     one across. */
  tbody tr:nth-child(even) {
    background: color-mix(in srgb, currentColor 4%, transparent);
  }
  /* No transition on purpose: the band under the pointer should be where the
     pointer is, not where it was a moment ago. */
  tbody tr:hover {
    background: color-mix(in srgb, currentColor 9%, transparent);
  }


  /* The colour is inherited on purpose, because these notes are shown on the
     Configurator's own surfaces as well as on the website and an accent chosen
     here would clash with one of them. The underline is what makes a link a
     link, and it was missing: the offset below was set whilst the global rule
     in app.css turned the decoration off, so nothing distinguished a link from
     the sentence around it. Measured on the changelog page, the link and its
     paragraph both computed to rgb(232, 234, 237) with no decoration at all. */
  a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  a:hover,
  a:focus-visible {
    text-decoration-thickness: 2px;
  }
  /* Beside the label rather than under the underline, and small enough to read
     as a mark on the link instead of as a second word. */
  a :global(.leaves) {
    margin-left: 0.25em;
    width: 0.85em;
    height: 0.85em;
  }
</style>
