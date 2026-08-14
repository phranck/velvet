<script lang="ts">
  import * as Card from "../components/card";
  import * as SquircleFrame from "../components/squircle-frame";
  import {
    SQUIRCLE_CONTENT_INSET,
    createSquircleRectPath,
  } from "../lib/squircle.js";
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
  const SERVICE_ENDPOINT = "https://setup.velvet.li/api/references";
  /**
   * The published site reads the service directly; a dev server reads it
   * through its own proxy.
   *
   * The service answers with no CORS header for an unknown origin, which is
   * right for a public endpoint and means a browser on localhost is refused.
   * The proxy in `vite.references.ts` makes the request same-origin, so the
   * page can be worked on with the data it actually shows.
   */
  const ENDPOINT = import.meta.env.DEV ? "/api/references" : SERVICE_ENDPOINT;

  /**
   * `null` until the answer is known, and afterwards the list or nothing.
   *
   * Nobody has agreed, the service could not be reached, and the request has
   * not finished are three different states, and all three show the same thing:
   * no gallery at all. Printing an empty frame would claim Velvet has no
   * references, which is a different statement from not knowing.
   */
  let installations = $state<Installation[] | null>(null);

  /**
   * The size a reference card spans, measured from the first one rendered.
   *
   * The outline is a path rather than a border, so it has to be computed at the
   * size it is drawn at instead of scaled to fit. The cards are square, and
   * every one in the grid is the same size, so one measurement drives all of
   * them.
   */
  let cardWidth = $state(0);
  let cardHeight = $state(0);

  /**
   * Clips a card's contents to the inner edge of its thick outline, so the
   * preview is cut by the curve rather than sitting in a rectangle inside it.
   */
  const cardClip = $derived(
    cardWidth > 0 && cardHeight > 0
      ? `path("${createSquircleRectPath(cardWidth, cardHeight, SQUIRCLE_CONTENT_INSET)}")`
      : "none",
  );

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
        <li bind:clientWidth={cardWidth} bind:clientHeight={cardHeight}>
          <!--
            The double outline every Velvet surface carries, drawn as squircle
            paths rather than as a border, because a squircle is not a
            border-radius. The contents are clipped to the inner edge of the
            thick line, so the picture meets the curve instead of being held
            away from it by a rectangle.
          -->
          <a
            class="reference-card"
            href={installation.url}
            target="_blank"
            rel="noopener noreferrer"
            data-reference-entry
          >
            <SquircleFrame.Outline width={cardWidth} height={cardHeight} />
            <span class="reference-card-body" style:clip-path={cardClip}>
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
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  <p class="consent-note">
    Appearing here is a choice, taken during setup and changeable at any time in
    the installation's own <code>velvet.yml</code>. Velvet discloses the page
    name and its address. Everything else on a card your browser reads from the
    status page itself, which publishes it to anybody.
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
  /* A step further from the grid below it than the other pages leave, because
     what follows here is a row of cards rather than a run of prose. */
  .lede {
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
  /* Square, because the shape is a squircle and a squircle stretched to a
     rectangle stops being one. */
  /* No fixed proportion. The card is as tall as the picture and the details
     make it, which keeps the picture whole and the lower part as short as what
     it holds. Wider than it is tall, and not by much, so the shape still reads
     as a squircle rather than a capsule. */
  .reference-list li {
    position: relative;
  }
  /*
    The card is the anchor itself, so the whole surface is the target rather
    than a link sitting inside a card. Colour drives the outline through
    `currentColor`, which is what lets a hover change the frame without this
    knowing how the frame is drawn.
  */
  .reference-card {
    /* `rule` is the token for a line or an edge, and the frame is one. Held
       well back at rest: what a reader is looking at is the pages, not the
       frames around them. */
    color: var(--velvet-rule);
    display: block;
    height: 100%;
    position: relative;
    text-decoration: none;
    /* Both are properties a compositor animates on its own, so this costs
       nothing beyond the frames it plays. */
    transition:
      color 160ms ease-out,
      transform 160ms ease-out;
    /* Lifted above the cards beside it whilst it grows, so the corner of the
       next one is not drawn over its own edge. */
    z-index: 0;
  }
  /* Stated rather than left to the engine: WebKit gives an anchor the arrow
     unless it is told otherwise, which is what #397 was about. */
  /* Stated on the card and everything in it, because the parts a reader points
     at are the picture and the text rather than the anchor's own background.
     Selection is off for the same reason: the whole card is one target, and a
     drag across its text turned the pointer into a text caret. */
  .reference-card,
  .reference-card * {
    cursor: pointer;
    user-select: none;
  }
  .reference-card:hover,
  .reference-card:focus-visible {
    color: var(--velvet-accent);
    transform: scale(1.02);
    z-index: 1;
  }
  /* The shadow sits on the body rather than on the card, because the card is
     the anchor and the body is the shape: a shadow on a rectangle around a
     squircle draws the corners the shape does not have. */
  .reference-card-body {
    transition: box-shadow 160ms ease-out;
  }
  .reference-card:hover .reference-card-body,
  .reference-card:focus-visible .reference-card-body {
    box-shadow: var(--velvet-card-shadow);
  }
  @media (prefers-reduced-motion: reduce) {
    .reference-card {
      transition: color 160ms ease-out;
    }
    .reference-card:hover,
    .reference-card:focus-visible {
      transform: none;
    }
  }
  /*
    The contents, clipped to the inner edge of the thick line. The padding is
    the frame's own inset plus the card padding, so text stands clear of the
    curve rather than against it.
  */
  .reference-card-body {
    color: var(--velvet-text);
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--velvet-surface-card);
    /* No inset: the picture reaches the inner edge of the thick line on three
       sides and is cut by the curve there, which is what makes it the card's
       own surface rather than a picture sitting on one. */
    padding: 0;
    font-size: var(--velvet-text-body);
    line-height: 1.5;
    box-sizing: border-box;
    overflow: hidden;
  }
  /* The picture reaches the card's own edge rather than sitting inside its
     padding, so the card's padding is cancelled around it. It therefore forms
     the card's top corners and takes the outer radius there, and is square
     where the details meet it. */
  /* No radius of its own: the card body is already clipped to the squircle, so
     the picture is cut by that curve where it meets the top corners. A radius
     here would draw a second, rounder corner just inside the first. */
  /* Fills the shape to the inner edge of the thick line, so the page being
     shown is what fills the card rather than sitting in a frame inside it. The
     clip on the body is what rounds it, since the curve forms these corners. */
  /* Takes every row the details leave, so the picture is what fills the shape
     and the lower part stays as short as its own content. No radius of its own:
     the clip on the body is what rounds these corners, and a radius here would
     draw a second, rounder corner just inside the first. */
  /*
    The picture's own proportion, so it fills the width with nothing above or
    below it.

    The card would rather give this two thirds of its height and the details the
    last third, which is what #439 is about. That needs a square preview: the
    published picture is the social card at 1200×630, and a wide picture cannot
    fill a taller box and stay whole at the same time. Until one exists, the
    picture decides its own share rather than being cropped or letterboxed.
  */
  .preview-frame {
    aspect-ratio: 1200 / 630;
    background: var(--velvet-surface-sunken);
    display: block;
    flex: none;
    overflow: hidden;
    position: relative;
  }
  /* `contain` rather than `cover`: the frame carries the picture's own
     proportion, so nothing is cropped and nothing is stretched. */
  .preview {
    display: block;
    height: 100%;
    object-fit: contain;
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
    /* Far enough in that the squircle's curve does not cut it, which it did at
       the inset a rectangular corner allowed. */
    inset-block-start: 0.75rem;
    inset-inline-start: 0.75rem;
    position: absolute;
    width: 0.625rem;
  }
  /* The inset the body no longer carries, plus room for the curve, which cuts
     deepest at the corners the text sits nearest to. */
  .details {
    /* The last third. The horizontal inset clears the curve, which cuts deepest
       at the corners the chips sit nearest to. */
    flex: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
    overflow: hidden;
    display: block;
    padding: 0.875rem calc(var(--velvet-card-padding) + 1rem)
      calc(var(--velvet-card-padding) + 0.75rem);
    text-align: center;
  }
  /* The heading face, as the site sets every name that titles something. */
  .reference-name {
    display: block;
    font-family: var(--velvet-font-heading);
    font-size: var(--velvet-text-copy);
    font-weight: 400;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* One fact per chip, wrapping rather than running off the card, so two cards
     side by side can be compared a fact at a time instead of a sentence at a
     time. */
  /* Centred, which also keeps the chips clear of the corners the curve cuts
     deepest into. */
  .facts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
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
  /* The frame and the lift carry the hover on their own. The name keeps its
     colour, because a card that answers in three places at once reads as three
     things happening rather than one surface responding. */
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
