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
    STATE_TOKENS,
    type Installation,
    type InstallationState,
    type Reference,
  } from "./installation";

  /** The legend, in the order a page moves through the states. */
  const LEGEND: InstallationState[] = [
    "operational",
    "degraded",
    "outage",
    "unknown",
  ];

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
    <!-- The lamp on each card is a colour, and a colour on its own asks a
         reader to work out what it means. This is where it is said, once, above
         the cards it applies to. -->
    <div class="legend-card">
      <Card.Root>
        <p class="legend" data-reference-legend>
          {#each LEGEND as state (state)}
            <span class="legend-item">
              <span
                class="dot"
                style="background: var({STATE_TOKENS[state]})"
                aria-hidden="true"
              ></span>
              {stateLabel(state)}
            </span>
          {/each}
        </p>
      </Card.Root>
    </div>

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
              <span class="preview-frame">
                <img
                  class="preview"
                  src={installation.previewUrl}
                  alt="The {installation.statusPageName} page"
                  loading="lazy"
                  decoding="async"
                />
                <!-- The state as a lamp on the board, lit in its own colour.
                     The legend above says what each colour means, and the title
                     says it here for anybody reading one card alone. -->
                <span
                  class="led"
                  style="--led: var({STATE_TOKENS[installation.state]})"
                  title={stateLabel(installation.state)}
                ></span>
              </span>
              <span class="details">
                <span class="reference-name">{installation.statusPageName}</span>
                <span class="facts">
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
    grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
    list-style: none;
    margin: 0 0 3rem;
    padding: 0;
  }
  /* The entry is the site's card, and the link fills it, so the whole surface
     is the target rather than the words on it. The card states the surface, the
     radius, and the padding. */
  .reference-list a {
    color: inherit;
    display: block;
    text-decoration: none;
  }
  /* The picture reaches the card's own edge rather than sitting inside its
     padding, so the card's padding is cancelled around it. It therefore forms
     the card's top corners and takes the outer radius there, and is square
     where the details meet it. */
  .preview-frame {
    aspect-ratio: 1200 / 630;
    background: var(--velvet-surface-sunken);
    border-radius: var(--velvet-card-radius) var(--velvet-card-radius) 0 0;
    display: block;
    margin: calc(-1 * var(--velvet-card-padding));
    margin-bottom: 0;
    overflow: hidden;
    position: relative;
  }
  .preview {
    display: block;
    height: 100%;
    object-fit: cover;
    width: 100%;
  }
  /* A lamp on the board, lit in the colour of the state. The ring is the glow
     it throws rather than a border, so it reads as light rather than as a
     second dot drawn around the first. */
  .led {
    background: var(--led);
    border-radius: 50%;
    box-shadow:
      0 0 0 2px rgb(0 0 0 / 0.35),
      0 0 0.375rem 0.0625rem var(--led),
      0 0 1rem 0.125rem color-mix(in srgb, var(--led) 55%, transparent);
    height: 0.625rem;
    inset-block-start: 0.75rem;
    inset-inline-start: 0.75rem;
    position: absolute;
    width: 0.625rem;
  }
  .details {
    display: block;
    padding: 0.75rem 0.5rem 0.5rem;
  }
  /* The condensed face, as the site sets every name that titles something. It
     also buys the width a long page name needs on a card this size. */
  .reference-name {
    display: block;
    font-family: var(--velvet-font-heading);
    font-size: var(--velvet-text-copy);
    font-weight: 600;
    line-height: 1.2;
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
    margin-top: 0.5rem;
  }
  /* A chip sits inside the card rather than against its curve, so it carries a
     radius of its own. Taking the card's inner radius would tie it to a padding
     it has nothing to do with. */
  .fact {
    align-items: center;
    background: var(--velvet-surface-raised);
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
  /* Said once above the cards, because the lamp on a card is a colour and a
     colour on its own says nothing until somebody has been told what it means.
     On the site's own card, so it reads as belonging to the gallery beneath it
     rather than to the paragraph above. */
  .legend-card {
    margin-bottom: 0.75rem;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem 1.5rem;
    justify-content: center;
    margin: 0;
    padding: 0.625rem var(--velvet-card-text-inset);
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-small);
  }
  .legend-item {
    align-items: center;
    display: flex;
    gap: 0.5rem;
  }
  .dot {
    border-radius: 50%;
    flex: none;
    height: 0.5rem;
    width: 0.5rem;
  }
  /* Marked by the text, because the card it sits on draws no edge to mark. */
  .reference-list a:hover .reference-name,
  .reference-list a:focus-visible .reference-name {
    color: var(--velvet-accent);
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
    border-top: 1px solid var(--velvet-rule);
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-small);
    padding-top: 1.5rem;
    text-align: center;
  }
</style>
