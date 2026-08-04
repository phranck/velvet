<script lang="ts">
  import type { TopicIndexEntry } from "./entry.js";

  /**
   * The list of places a long page holds, standing beside it.
   *
   * One component rather than one per page. The reference lists its topics and
   * the changelog its releases, and both want the same panel, the same marking
   * of where the reader has got to, and the same behaviour when an entry is
   * followed.
   *
   * The entries carry `data-topic-link` and the page's own headings carry
   * `data-topic`, which is what `page-script.js` reads. Nothing here runs any
   * code: every entry is an ordinary link to an ordinary anchor, so a reader
   * whose script never runs can still reach any of them.
   */
  let {
    entries,
    label,
  }: {
    entries: readonly TopicIndexEntry[];
    /** What the list is a list of, for a reader who cannot see it. */
    label: string;
  } = $props();
</script>

<aside class="topic-index" aria-label={label}>
  <nav>
    <ul>
      {#each entries as entry (entry.id)}
        <li>
          <a href={`#${entry.id}`} data-topic-link={entry.id}>
            <span class="label">{entry.label}</span>
            {#if entry.detail}
              <span class="detail">{entry.detail}</span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </nav>
</aside>

<style>
  /* Pinned below the bar rather than at the top of the window, because the bar
     is what sits there. It never scrolls out of the top, and scrolls within
     itself once the list is taller than what is left of the window. */
  .topic-index {
    align-self: start;
    /* Its own geometry rather than the page's, and stated here so the entries
       below derive from what actually applies to them. A panel of short links
       reads as a lighter surface than a card of prose, so it is rounded less
       and holds its content closer in. */
    --topic-index-radius: 28px;
    --topic-index-padding: 8px;
    --topic-index-inner-radius: max(
      calc(var(--topic-index-radius) - var(--topic-index-padding)),
      0px
    );
    padding: var(--topic-index-padding);
    border-radius: var(--topic-index-radius);
    background: #14161d;
  }
  @media (min-width: 960px) {
    .topic-index {
      position: sticky;
      top: 5.75rem;
      max-height: calc(100vh - 7.5rem);
      overflow-y: auto;
    }
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* An entry is a surface nested in the panel, so it takes the panel's radius
     less the panel's own inset. Its label stands as far in from the entry as
     the panel's content stands in from the panel, and takes half the entry's
     radius on top of that to clear the curve. The panel states that one
     distance and both readings of it follow. */
  a {
    display: block;
    padding: 0.25rem
      calc(var(--topic-index-padding) + var(--topic-index-inner-radius) / 2);
    border-radius: var(--topic-index-inner-radius);
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-body);
    line-height: 1.45;
    text-decoration: none;
  }
  a:hover,
  a:focus-visible {
    color: var(--velvet-text);
  }
  /* The entry a reader has reached. Marked by a script in the page, so the rule
     is global or Svelte finds no element carrying the attribute and removes it
     as unused. */
  a:global([data-current]) {
    color: var(--velvet-accent);
    background: color-mix(in srgb, var(--velvet-accent) 10%, transparent);
  }
  .label {
    display: block;
  }
  /* Quieter and smaller than the label, because it answers a question the
     reader has only after they have found the entry. */
  .detail {
    display: block;
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-small);
    line-height: 1.3;
    opacity: 0.75;
  }
</style>
