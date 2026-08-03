<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import SiteFooter from "../components/SiteFooter.svelte";
  import SiteHeader from "../components/SiteHeader.svelte";

  /** What the setup service discloses about a consenting installation. */
  interface Reference {
    statusPageName: string;
    url: string;
  }

  /**
   * Where the consenting installations are read from.
   *
   * The registry itself is private, and this website is static on GitHub Pages
   * with no credentials, so the setup service is the only party that can read
   * it. Reading at request time rather than at build time is what makes a
   * withdrawal take effect promptly instead of at the next rebuild.
   */
  const ENDPOINT = "https://setup.velvet.li/api/references";

  /**
   * `null` until the answer is known, and afterwards the list or nothing.
   *
   * Nobody has agreed, the service could not be reached, and the request has
   * not finished are three different states, and all three show the same thing:
   * no gallery at all. Printing an empty frame would claim Velvet has no
   * references, which is a different statement from not knowing.
   */
  let references = $state<Reference[] | null>(null);

  $effect(() => {
    const request = new AbortController();
    void (async () => {
      try {
        const response = await fetch(ENDPOINT, {
          headers: { Accept: "application/json" },
          signal: request.signal,
        });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const entries =
          typeof body === "object" && body !== null
            ? (body as { entries?: unknown }).entries
            : null;
        if (!Array.isArray(entries)) return;
        references = entries.filter(
          (entry): entry is Reference =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as Reference).statusPageName === "string" &&
            typeof (entry as Reference).url === "string",
        );
      } catch {
        // An unreachable service leaves the page as it started, which is the
        // same as having nothing to show.
      }
    })();
    return () => request.abort();
  });
</script>

<SiteHeader current="references" />

<main class="references velvet-page">
  <h1>Who runs Velvet</h1>
  <p class="lede">
    Status pages published with Velvet, named here because their owners said
    they could be. Every one of them is a live installation.
  </p>

  {#if references && references.length > 0}
    <ul class="reference-list" data-reference-list>
      {#each references as reference (reference.url)}
        <li>
          <a href={reference.url} target="_blank" rel="noopener noreferrer">
            <span class="reference-name">{reference.statusPageName}</span>
            <Icon name="export-arrow-01" />
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="consent-note">
    Appearing here is a choice, taken during setup and changeable at any time in
    the Configurator. Only the page name and its address are ever shown, and
    whether the repository behind it is public or private makes no difference.
  </p>
</main>

<SiteFooter />

<style>
  /* The site's own measure, shared with the header and the footer. */
  .references {
    padding: 3rem 0 6rem;
  }
  /* Both introduce the gallery beneath them, so both take the inset its entries
     take.

     Each rule below states `margin-block` rather than the `margin` shorthand,
     which sets all four sides and reset the inline margins this rule had just
     given them. Measured at a 1440px window: both sat at 120, the page edge. */
  h1,
  .lede {
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
    margin-block: 0 3rem;
  }
  .reference-list {
    display: grid;
    gap: 0.75rem;
    list-style: none;
    margin: 0 0 3rem;
    padding: 0;
  }
  .reference-list a {
    align-items: center;
    background: #14161d;
    border: 1px solid #222530;
    border-radius: 0.75rem;
    color: inherit;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    text-decoration: none;
  }
  .reference-list a:hover,
  .reference-list a:focus-visible {
    border-color: var(--velvet-accent, #8ca5ff);
  }
  .reference-name {
    font-weight: 600;
  }
  .reference-list :global(svg) {
    color: var(--velvet-accent, #8ca5ff);
  }
  /* Closes the page with nothing beneath it. There is no card here to line up
     with, so it takes no text inset, and its rule closes the page rather than
     separating two parts of it.

     The one paragraph on the site held narrower than its column. It is a note
     about the gallery above it rather than prose somebody reads down, and
     centring it under the entries is what marks it as the end of the page
     instead of a further entry. */
  .consent-note {
    width: 80%;
    margin-inline: auto;
    border-top: 1px solid #222530;
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-small);
    padding-top: 1.5rem;
  }
</style>
