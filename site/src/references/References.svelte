<script lang="ts">
  import * as Card from "../components/card";
  import SiteFooter from "../components/SiteFooter.svelte";
  import SiteHeader from "../components/SiteHeader.svelte";
  import {
    describeInstallation,
    releaseDate,
    stateLabel,
    uptimeBreakdown,
    uptimeDays,
    type Installation,
    type Reference,
  } from "./installation";

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
  let installations = $state<Installation[] | null>(null);

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
        const references = entries.filter(
          (entry): entry is Reference =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as Reference).statusPageName === "string" &&
            typeof (entry as Reference).url === "string",
        );

        // Each installation is asked about itself, and one that does not answer
        // is left out. Its card could only show a name pointing at a page a
        // visitor cannot open, and the service removes it from the registry
        // within the hour anyway.
        const described = await Promise.all(
          references.map((reference) =>
            describeInstallation(reference, request.signal),
          ),
        );
        installations = described.filter(
          (entry): entry is Installation => entry !== null,
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

  {#if installations && installations.length > 0}
    <ul class="reference-list" data-reference-list>
      {#each installations as installation (installation.url)}
        <li>
          <Card.Root>
            <a
              href={installation.url}
              target="_blank"
              rel="noopener noreferrer"
              data-reference-entry
            >
              <img
                class="preview"
                src={installation.previewUrl}
                alt="The {installation.statusPageName} page"
                loading="lazy"
                decoding="async"
              />
              <span class="details">
                <span class="reference-name">{installation.statusPageName}</span>
                <span class="host">{installation.host}</span>
                <span class="facts">
                  <span class="fact">
                    <span
                      class="dot"
                      style="background: {installation.stateColour}"
                      aria-hidden="true"
                    ></span>
                    {stateLabel(installation.state)}
                  </span>
                  <span class="fact">
                    {installation.services}
                    {installation.services === 1 ? "service" : "services"}
                  </span>
                  {#if releaseDate(installation.startedAt)}
                    <span class="fact">
                      <span class="label">Release:</span>
                      {releaseDate(installation.startedAt)}
                    </span>
                  {/if}
                  {#if uptimeDays(installation.startedAt)}
                    <!-- The exact span is a hover away rather than in the chip,
                         since the chip is compared against the one on the card
                         beside it and a single unit is what compares. -->
                    <span class="fact" title={uptimeBreakdown(installation.startedAt) ?? undefined}>
                      <span class="label">Uptime:</span>
                      {uptimeDays(installation.startedAt)}
                    </span>
                  {/if}
                </span>
              </span>
            </a>
          </Card.Root>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="consent-note">
    Appearing here is a choice, taken during setup and changeable at any time in
    the Configurator. Velvet discloses the page name and its address, and
    nothing else. Everything a card shows beyond those, the preview, the state,
    the services and the dates, your browser reads from the status page itself,
    which publishes them to anybody. Whether the repository behind it is public
    or private makes no difference.
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
  /* A grid rather than a column, so one entry occupies one cell instead of a
     row the width of the page. The track is wide enough for the preview to be
     legible and narrow enough that three fit the measure. */
  .reference-list {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    list-style: none;
    margin: 0 0 3rem;
    padding: 0;
  }
  /* Two layers rather than one, the same pair the onboarding card carries. A
     single wide shadow dissolves into the board backdrop these pages sit on and
     leaves the card looking pasted flat; the near layer draws its edge and the
     far one carries the height. Softer than the onboarding's, since a gallery
     shows several of these at once and that card is the size of a screen. */
  .reference-list li > :global(*) {
    box-shadow:
      0 0.5rem 1rem rgba(0, 0, 0, 0.4),
      0 1.25rem 3rem rgba(0, 0, 0, 0.45);
  }
  /* The entry is the site's card, and the link fills it, so the whole surface
     is the target rather than the words on it. The card states the surface, the
     radius, and the padding. */
  .reference-list a {
    color: inherit;
    display: block;
    text-decoration: none;
  }
  /* The picture runs the full width of the card's content box, so it takes the
     inner radius and no text inset: it has an edge of its own. Its ratio is the
     social card's, stated so the space is held before the image arrives and the
     grid does not jump as the gallery fills. */
  .preview {
    aspect-ratio: 1200 / 630;
    background: #0e1017;
    border-radius: var(--velvet-card-inner-radius);
    display: block;
    object-fit: cover;
    width: 100%;
  }
  .details {
    display: block;
    padding: 1rem var(--velvet-card-text-inset) 0.75rem;
  }
  /* The condensed face, as the site sets every name that titles something. It
     also buys the width a long page name needs on a card this size. */
  .reference-name {
    display: block;
    font-family: var(--velvet-font-heading);
    font-size: var(--velvet-text-heading);
    font-weight: 600;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .host {
    color: var(--velvet-text-muted);
    display: block;
    font-size: var(--velvet-text-small);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* One fact per chip, wrapping rather than running off the card, so two cards
     side by side can be compared a fact at a time instead of a sentence at a
     time. */
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-top: 0.875rem;
  }
  /* A chip sits inside the card rather than against its curve, so it carries a
     radius of its own. Taking the card's inner radius would tie it to a padding
     it has nothing to do with. */
  .fact {
    align-items: center;
    background: #1c1f29;
    border-radius: 0.5rem;
    display: flex;
    font-size: var(--velvet-text-small);
    gap: 0.375rem;
    line-height: 1.4;
    padding: 0.25rem 0.5rem;
    white-space: nowrap;
  }
  .fact .label {
    color: var(--velvet-text-muted);
  }
  /* The word carries the state and the dot repeats it. Colour alone would ask a
     reader to tell two tints apart, and the tints are the installation's own
     rather than a palette this page controls. */
  .dot {
    border-radius: 50%;
    flex: none;
    height: 0.5rem;
    width: 0.5rem;
  }
  /* Marked by the text, because the card it sits on draws no edge to mark. */
  .reference-list a:hover .reference-name,
  .reference-list a:focus-visible .reference-name {
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
    text-align: center;
  }
</style>
