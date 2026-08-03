<script lang="ts">
  import Icon from "./Icon.svelte";
  import { tokenizeCode } from "../lib/highlight-yaml.js";

  /**
   * A block of code, coloured and numbered.
   *
   * One component rather than one per surface, because the start page shows
   * install commands and the reference shows configuration, and both want the
   * same block. What differs is the language and whether the page can wire a
   * copy button, and those are the two things it takes.
   *
   * The colouring happens where this renders, so a prerendered page carries it
   * without shipping a highlighter.
   */
  let {
    code,
    language,
    copyable = false,
    label = "Copy this",
  }: {
    code: string;
    language?: string;
    /**
     * Off by default, because the button is wired by a script in the page
     * rather than here, and a surface without that script would show a control
     * that does nothing.
     */
    copyable?: boolean;
    label?: string;
  } = $props();

  const lines = $derived(tokenizeCode(code, language));
</script>

<div class="code-block">
  {#if copyable}
    <!--
      Disabled in the markup and enabled by the page's script, so a reader whose
      browser cannot copy is shown no control rather than a dead one.
    -->
    <button type="button" class="copy" data-copy-code aria-label={label} disabled>
      <Icon name="copy" />
    </button>
  {/if}
  <!--
    The numbers are a column beside the code rather than a span in front of each
    line, so the gutter runs the full height of the block with no gap above or
    below it, and stays put whilst a long line scrolls.
  -->
  <pre><span class="gutter" aria-hidden="true">{#each lines, lineIndex}<span
          class="line-number">{lineIndex + 1}</span
        >{/each}</span><code>{#each lines as line, lineIndex (lineIndex)}<span
          class="line"
        >{#each line as token, tokenIndex (tokenIndex)}<span
              class={token.kind}>{token.value}</span
            >{/each}</span
        >{/each}</code></pre>
</div>

<style>
  /* Positions the copy button against the block rather than in the flow, and
     carries the surface so the button sits on it rather than beside it. */
  .code-block {
    position: relative;
    border-radius: 0.5rem;
    overflow: hidden;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  /* Two columns rather than one flow: the gutter, then the code. The block
     carries no padding of its own, so the gutter reaches the top and bottom
     edges, and each column pads itself instead. */
  pre {
    display: flex;
    align-items: stretch;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  /* Darker than the block rather than lighter. The block is already a light
     tint over a dark surface, so lightening the gutter further left the two
     indistinguishable; measured at 2% alpha before this. */
  .gutter {
    flex: none;
    padding: 0.875rem 0.6rem;
    border-right: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    background: color-mix(in srgb, #000 28%, transparent);
    color: color-mix(in srgb, currentColor 40%, transparent);
    text-align: right;
    user-select: none;
  }
  .line-number {
    display: block;
    min-width: 1.5rem;
  }
  /* Only the code scrolls, so the numbers stay beside the line they belong to
     however far a line runs. Room on the right for the copy button, so a long
     line does not run underneath it. */
  pre > code {
    flex: 1;
    padding: 0.875rem 3.25rem 0.875rem 1rem;
    overflow-x: auto;
    background: none;
    border-radius: 0;
  }
  /* Stated on both columns and identical, because a number and the line it
     counts have to sit on the same baseline. Left to inherit, the gutter took
     its height from its own line boxes and the two drifted apart by a line
     over nine of them. */
  .gutter,
  pre > code {
    /* Its own size rather than a fraction of the prose around it, so a page
       reading a step larger does not carry the code with it. */
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: var(--velvet-text-code, 0.9375rem);
    line-height: 1.7;
  }
  .line {
    display: block;
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

  /* The icon alone: no border, no background, nothing but the mark. */
  .copy {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: none;
    color: var(--velvet-text-muted, #979aa8);
    cursor: pointer;
    /* The way back from the copied colour, and only that way. The rule below
       turns the transition off whilst the mark is being set, so the green
       arrives at once and drains away afterwards. */
    transition: color 900ms ease;
  }
  .copy[disabled] {
    /* Not merely dimmed. Until the page's script enables it, pressing it would
       do nothing, and a control that does nothing is worse than none. */
    display: none;
  }
  .copy:hover,
  .copy:focus-visible {
    color: var(--velvet-text, #efedf5);
  }
  /* Global, because the attribute is set by the page's script after the copy
     succeeds and never appears in this markup. Left scoped, Svelte finds no
     element carrying it and removes the rule as unused. */
  .copy:global([data-copied]) {
    color: #9ece6a;
    transition: none;
  }
</style>
