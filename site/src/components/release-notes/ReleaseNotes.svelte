<script lang="ts">
  import {
    parseReleaseNotes,
    type ReleaseNotesHeadings,
    type ReleaseNotesInline,
  } from "../../lib/release-notes.js";

  let {
    source,
    /**
     * Which heading arrangement the surrounding page needs. The default is what
     * the Configurator's overlay has always shown, because that panel supplies
     * the only level-one heading and a note may not add depth beneath it. A
     * page rendering a whole document asks for `outline` instead.
     */
    headings = "flattened",
  }: { source: string; headings?: ReleaseNotesHeadings } = $props();

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
      <a href={part.href} target="_blank" rel="noreferrer noopener">{part.value}</a>
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
      <pre><code>{block.value}</code></pre>
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

  h2,
  h3 {
    margin: 0;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  h2 {
    font-size: 15px;
    font-weight: 650;
  }

  h3 {
    font-size: 14px;
    font-weight: 650;
  }

  h2:not(:first-child),
  h3:not(:first-child) {
    margin-top: 0.5rem;
  }

  p {
    margin: 0;
  }

  ul,
  ol {
    margin: 0;
    padding-inline-start: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.875em;
    padding: 0.125em 0.375em;
    border-radius: 0.25rem;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }

  pre {
    margin: 0;
    padding: 0.875rem 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  /* The scroll lives on this wrapper rather than the table, because a table is
     sized by its contents and would report that width to everything above it,
     widening the page instead of scrolling inside it. */
  .table-scroll {
    overflow-x: auto;
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
    border-bottom: 1px solid color-mix(in srgb, currentColor 15%, transparent);
    vertical-align: top;
  }
  th {
    font-weight: 650;
    white-space: nowrap;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }

  pre code {
    padding: 0;
    background: none;
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
</style>
