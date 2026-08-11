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
   *
   * The label is drawn rather than hidden, and the panel is named by it. A
   * heading a reader can see says the same thing to everybody, whilst
   * `aria-label` said it only to a reader who could not.
   */
  let {
    entries,
    label,
  }: {
    entries: readonly TopicIndexEntry[];
    /** What the list is a list of, drawn above it and naming the panel. */
    label: string;
  } = $props();

  /**
   * What names the panel.
   *
   * Two steps rather than one, because Svelte accepts `$props.id()` only as the
   * whole initialiser of a declaration and refuses it inside a template
   * literal. Unique per instance, so two indexes on one page cannot both claim
   * the same name.
   */
  const instanceId = $props.id();
  const headingId = `topic-index-${instanceId}`;
</script>

<aside class="topic-index" aria-labelledby={headingId}>
  <p class="heading" id={headingId}>{label}</p>
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
       and holds its content closer in.

       24 rather than 28, so the entries keep the curve this panel derives for
       them. An entry stands 34px tall, so anything above 17px is clamped to a
       full pill by the browser and the concentric rounding is lost: the gap
       between the two curves stops being constant. At 24 the entries take 16,
       which is under that ceiling and therefore actually drawn. */
    --topic-index-radius: 24px;
    --topic-index-padding: 8px;
    --topic-index-inner-radius: max(
      calc(var(--topic-index-radius) - var(--topic-index-padding)),
      0px
    );
    padding: var(--topic-index-padding);
    border-radius: var(--topic-index-radius);
    background: var(--velvet-surface-card);
    /* The same shadow a card carries, from the same token, so the panel stands
       off the board exactly as far as the notes beside it do. */
    box-shadow: var(--velvet-card-shadow);
  }
  @media (min-width: 960px) {
    .topic-index {
      position: sticky;
      top: 5.75rem;
      max-height: calc(100vh - 7.5rem);
      overflow-y: auto;
    }
  }
  /* What the list is a list of. Set in the label face like every other line on
     the site that names something rather than saying it, and inset to the same
     distance from the panel's edge as an entry's own label, so the two start on
     one line. */
  .heading {
    margin: 0.375rem 0 0.75rem;
    padding-inline: calc(
      var(--topic-index-padding) + var(--topic-index-inner-radius) / 2
    );
    color: var(--velvet-accent);
    font-family: var(--velvet-font-label);
    font-size: var(--velvet-text-label-small);
    font-weight: 700;
    letter-spacing: var(--velvet-tracking-wide);
    line-height: 1;
    text-transform: uppercase;
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
  /* One row, with whatever detail an entry carries pushed to the far end. An
     entry without one holds a single child, which `space-between` leaves at the
     start, so the topic index reads exactly as it did before. */
  a {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.25rem
      calc(var(--topic-index-padding) + var(--topic-index-inner-radius) / 2);
    border-radius: var(--topic-index-inner-radius);
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-body);
    line-height: 1.45;
    text-decoration: none;
  }
  /* A surface under the pointer, not only a brighter label, so the whole entry
     answers rather than the word alone. No transition: the tint belongs to
     where the pointer is now, and fading it in leaves it trailing behind a
     reader running down the list. */
  a:hover,
  a:focus-visible {
    color: var(--velvet-text);
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  /* The entry a reader has reached. Marked by a script in the page, so the rule
     is global or Svelte finds no element carrying the attribute and removes it
     as unused. */
  a:global([data-current]) {
    color: var(--velvet-accent);
    background: var(--velvet-accent-tint);
  }
  /* Hovering the entry a reader is already on must not wash its tint away,
     which the neutral rule above would do by replacing the background. It
     deepens instead, so the entry still reads as the current one. */
  a:global([data-current]):hover,
  a:global([data-current]):focus-visible {
    color: var(--velvet-accent);
    background: color-mix(in srgb, var(--velvet-accent) 16%, transparent);
  }
  /* Takes the room the detail does not, so a long topic wraps rather than
     pushing the date out of the panel. */
  .label {
    min-width: 0;
  }
  /* Quieter and smaller than the label, because it answers a question the
     reader has only after they have found the entry. Kept on one line and
     stopped from shrinking, so it stays legible at the end of the row. */
  .detail {
    flex-shrink: 0;
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-caption);
    line-height: 1.3;
    opacity: 0.75;
    white-space: nowrap;
  }
</style>
