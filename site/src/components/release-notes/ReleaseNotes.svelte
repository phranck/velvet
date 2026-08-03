<script lang="ts">
  import {
    parseReleaseNotes,
    type ReleaseNotesHeadings,
    type ReleaseNotesInline,
  } from "../../lib/release-notes.js";
  import { tokenizeCode } from "../../lib/highlight-yaml.js";

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
        {part.value}<i class="ph-duotone ph-arrow-square-out" aria-hidden="true"
        ></i>
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
      <div class="code-block">
        {#if copyable}
          <!--
            Wired by a small script in the page rather than here, because the
            documentation is prerendered and its bundle is removed. The button
            is disabled until that script enables it, so a page whose script
            never arrives shows no control that does nothing.
          -->
          <button
            type="button"
            class="copy"
            data-copy-code
            aria-label="Copy this configuration"
            disabled
          >
            <i class="ph-duotone ph-copy" aria-hidden="true"></i>
          </button>
        {/if}
        <pre><code>{#each tokenizeCode(block.value, block.language) as line, lineIndex (lineIndex)}<span
                class="line"
              ><span class="line-number" aria-hidden="true">{lineIndex + 1}</span
                >{#each line as token, tokenIndex (tokenIndex)}<span
                    class={token.kind}>{token.value}</span
                  >{/each}</span
              >{/each}</code></pre>
      </div>
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
    /* The token already carries its own fallbacks, so nothing is repeated
       after it. The fallback here is for a surface that defines no token. */
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.875em;
    padding: 0.125em 0.375em;
    border-radius: 0.25rem;
    background: color-mix(in srgb, currentColor 10%, transparent);
  }

  /* Positions the copy button against the block rather than in the flow, and
     carries the surface so the button sits on it rather than beside it. */
  .code-block {
    position: relative;
    border-radius: 0.5rem;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  pre {
    margin: 0;
    padding: 0.875rem 1rem;
    /* Room on the right for the button, so a long line runs under nothing. */
    padding-right: 3.25rem;
    overflow-x: auto;
  }
  /* A line is its number and its content, and the number is a column of its own
     so a wrapped or scrolled line cannot slide underneath it. */
  .line {
    display: block;
  }
  .line-number {
    display: inline-block;
    width: 2ch;
    margin-right: 1.25ch;
    color: color-mix(in srgb, currentColor 35%, transparent);
    text-align: right;
    user-select: none;
  }

  .comment {
    color: color-mix(in srgb, currentColor 45%, transparent);
    font-style: italic;
  }
  .key {
    color: var(--velvet-accent, #8ca5ff);
  }
  .string {
    color: #9ece6a;
  }
  .number,
  .boolean {
    color: #e0af68;
  }
  .punctuation {
    color: color-mix(in srgb, currentColor 55%, transparent);
  }

  .copy {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: 0.375rem;
    background: color-mix(in srgb, currentColor 8%, transparent);
    color: inherit;
    font-size: 1rem;
    cursor: pointer;
  }
  .copy[disabled] {
    /* Not merely dimmed. Until the page's script enables it, pressing it would
       do nothing, and a control that does nothing is worse than none. */
    display: none;
  }
  .copy:hover,
  .copy:focus-visible {
    border-color: color-mix(in srgb, currentColor 35%, transparent);
  }
  /* Global, because the attribute is set by the page's script after the copy
     succeeds and never appears in this markup. Left scoped, Svelte finds no
     element carrying it and removes the rule as unused, so the button gave no
     sign that anything had happened. */
  .copy:global([data-copied]) {
    color: #9ece6a;
    border-color: currentColor;
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
  /* Beside the label rather than under the underline, and small enough to read
     as a mark on the link instead of as a second word. */
  a i {
    margin-left: 0.25em;
    font-size: 0.85em;
    text-decoration: none;
    vertical-align: baseline;
  }
</style>
