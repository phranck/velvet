<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import CodeBlock from "../components/CodeBlock.svelte";
  import SiteFooter from "../components/SiteFooter.svelte";
  import SiteHeader from "../components/SiteHeader.svelte";
  import VelvetToolBrand from "../components/VelvetToolBrand.svelte";
  import * as CRTSquircle from "../components/crt-squircle";
  import * as SquircleCard from "../components/squircle-card";
  import * as StepCard from "../components/step-card";
  import {
    STEP_CARD_CONTENT_INSET,
    STEP_CARD_INNER_RADIUS,
  } from "../components/step-card/geometry.js";
  // The README's screenshot, imported from where it already lives rather than
  // copied here, so the page and the repository can never show different ones.
  // The same capture without a window around it, because the tube below is
  // the frame. `docs/screenshot.png` keeps its window for the README, which is
  // read on a page that has none.
  import screenshotUrl from "./assets/screenshot-screen.png";
  // The designs a page can be published in, read from the manifests that ship
  // with Velvet, so this page cannot offer one that does not exist or miss one
  // that does.
  import { GALLERY_DESIGNS } from "./design-gallery.js";
  import * as SquircleFrame from "../components/squircle-frame";
  import {
    SQUIRCLE_CONTENT_INSET,
    createSquircleRectPath,
  } from "../lib/squircle.js";

  /**
   * The box a theme tile is drawn in, and the squircle cut inside it.
   *
   * A nominal size rather than a measured one, because this page ships as
   * prerendered HTML and loads no script. It is the size a tile renders at in
   * the two-column grid, so the frame's two lines come out at the widths they
   * are declared at, and it carries the pictures' own 16 by 10 proportion, so
   * scaling it to a narrower tile stays uniform.
   *
   * The picture is cut at the inner edge of the wide line, which is what
   * `SQUIRCLE_CONTENT_INSET` names. Stated as a path in that box and applied
   * with `clipPathUnits="objectBoundingBox"`, so the one definition fits every
   * tile: the transform is what maps the box onto the 0 to 1 space that unit
   * expects.
   */
  const TILE_WIDTH = 576;
  const TILE_HEIGHT = 461;
  const TILE_CONTENT_PATH = createSquircleRectPath(
    TILE_WIDTH,
    TILE_HEIGHT,
    SQUIRCLE_CONTENT_INSET,
  );
  const TILE_CONTENT_TRANSFORM = `scale(${1 / TILE_WIDTH} ${1 / TILE_HEIGHT})`;

  /**
   * Where a visitor goes to install Velvet. The setup service redirects its
   * root here, but the deep link is used so nobody pays for the extra hop.
   */
  const ONBOARDING_URL = "https://setup.velvet.li/onboarding/";
  const REPOSITORY_URL = "https://github.com/phranck/velvet";

  /**
   * The man-page archive, written into this build by
   * `site/scripts/build-man-pages.ts`. Absolute, because the file sits at the
   * root of the published site whilst the page linking to it may not.
   */
  const MAN_PAGES_ARCHIVE = "/velvet-man-pages.tar.gz";

  /**
   * How the archive is installed. Every line runs as an ordinary user and
   * writes only inside the home directory, which is the point of offering it
   * this way rather than as a package.
   *
   * It unpacks into a temporary directory and removes it afterwards, so
   * following these three lines leaves nothing behind. Downloading the archive
   * into the current directory and unpacking it there left both sitting where
   * somebody ran it.
   */
  const MAN_PAGES_INSTALL = [
    "velvet=$(mktemp -d)",
    `curl -sL https://velvet.li${MAN_PAGES_ARCHIVE} | tar -xz -C "$velvet"`,
    '"$velvet"/velvet-man-pages/install.sh && rm -rf "$velvet"',
  ].join("\n");

  /**
   * What an installation gives you, drawn from the README so the page and the
   * repository cannot describe the product differently.
   */
  const CAPABILITIES = [
    {
      icon: "activity",
      title: "Checks that run on GitHub",
      description:
        "Direct IPv4 GET and HEAD checks from GitHub-hosted runners, every five minutes, with response-time samples four times a day.",
    },
    {
      icon: "warning-2",
      title: "Incidents that open themselves",
      description:
        "A confirmed failure opens a GitHub issue, and a recovery closes it. Planned maintenance stays visible as a neutral event in the history.",
    },
    {
      icon: "chart",
      title: "A year of history",
      description:
        "Up to 365 days of availability, response times, incidents, and maintenance, kept on a dedicated branch rather than in a database.",
    },
    {
      icon: "color-swatch",
      title: "A page somebody designed",
      description:
        "Four curated designs, each shipped whole with the typefaces it uses, plus service icons, SEO output, and selectable history ranges.",
    },
    {
      icon: "global",
      title: "Your own domain",
      description:
        "Published through GitHub Pages, with a custom domain when you want one, and no server or database anywhere in the picture.",
    },
    {
      icon: "shield-tick",
      title: "Nothing leaks into the open",
      description:
        "Endpoint URLs and secrets never enter the published documents, and invalid data leaves the last valid snapshot untouched.",
    },
  ] as const;

  /**
   * How a published installation works once it runs, condensed from the
   * README's five steps into what a visitor needs before deciding.
   */
  const PIPELINE = [
    {
      title: "You describe what to watch",
      description:
        "A file called velvet.yml names the repository, the page, and every service. A public website needs only a name and a URL.",
    },
    {
      title: "GitHub Actions does the checking",
      description:
        "The status workflow runs every five minutes and the response workflow four times a day, both on GitHub's own runners.",
    },
    {
      title: "Results are published as data",
      description:
        "Each successful run writes one validated snapshot to a dedicated branch. The monitor never rewrites your default branch.",
    },
    {
      title: "The page builds from that snapshot",
      description:
        "GitHub Pages renders the status page, its social card, and its SEO files, and keeps doing so whether or not the setup service is up.",
    },
  ];
</script>

<!--
  The shell rather than the mount point carries the site class here, because on
  this page it is the shell that holds the bar, the content, and the credit.
-->
<div
  class="website-shell velvet-site"
  style={`--step-card-inner-radius: ${STEP_CARD_INNER_RADIUS}px; --step-card-content-inset: ${STEP_CARD_CONTENT_INSET}px`}
>
  <SiteHeader />

  <main>
    <section class="hero column">
      <div class="brand-block">
        <VelvetToolBrand subtitle="STATUS PAGES" />
      </div>
      <p class="lead">
        <!-- The one break on the site placed by hand, asked for deliberately.
             It balances the sentence at the width the hero is read at, and the
             rule against hand-set breaks holds everywhere else. -->
        GitHub-native status monitoring and a polished status page,<br />
        without a server or a database. Just five steps away.
      </p>
      <div class="hero-actions">
        <a class="velvet-button velvet-button--primary" href={ONBOARDING_URL} data-onboarding-link>
          <Icon name="flash" />
          <span>Create your status page</span>
        </a>
        <a
          class="velvet-button velvet-button--secondary"
          href={REPOSITORY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <i class="ph-duotone ph-github-logo" aria-hidden="true"></i>
          <span>Read the source</span>
        </a>
      </div>
    </section>

    <section class="showcase" aria-label="A published Velvet status page">
      <div class="showcase-plate">
        <a href={ONBOARDING_URL} tabindex="-1" aria-hidden="true">
          <CRTSquircle.Root>
            <img
              src={screenshotUrl}
              alt="A Velvet status page showing services, uptime bars, and a response-time chart"
              width="1770"
              height="1328"
              fetchpriority="high"
              decoding="async"
            />
          </CRTSquircle.Root>
        </a>
      </div>
    </section>

    <section class="column" aria-labelledby="capabilities-title">
      <div class="card-inset">
          <div class="velvet-section-heading">
            <div class="velvet-section-title">
              <span class="marker" aria-hidden="true">//</span>
              <h2 id="capabilities-title">What an installation gives you</h2>
            </div>
            <p>
              Velvet monitors websites and HTTP endpoints from GitHub Actions,
              records incidents and planned maintenance in GitHub Issues, and
              publishes the result as a static page.
            </p>
          </div>
          <ul class="capabilities">
            {#each CAPABILITIES as capability (capability.title)}
              <li>
                <SquircleCard.Root>
                  <SquircleCard.Body>
                    <div class="entry">
                      <Icon name={capability.icon} />
                      <div>
                        <h3>{capability.title}</h3>
                        <p>{capability.description}</p>
                      </div>
                    </div>
                  </SquircleCard.Body>
                </SquircleCard.Root>
              </li>
            {/each}
          </ul>
      </div>
    </section>

    <section class="column" aria-labelledby="pipeline-title">
      <div class="card-inset">
          <div class="velvet-section-heading">
            <div class="velvet-section-title">
              <span class="marker" aria-hidden="true">//</span>
              <h2 id="pipeline-title">How it works</h2>
            </div>
            <p>
              GitHub is part of the platform rather than a place to host it.
              Scheduling, incidents, generated data, and the public site each
              live in something GitHub already provides.
            </p>
          </div>
          <ol class="pipeline">
            {#each PIPELINE as stage, index (stage.title)}
              <li>
                <SquircleCard.Root>
                  <SquircleCard.Body>
                    <div class="entry">
                      <span class="pipeline-number" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3>{stage.title}</h3>
                        <p>{stage.description}</p>
                      </div>
                    </div>
                  </SquircleCard.Body>
                </SquircleCard.Root>
              </li>
            {/each}
          </ol>
      </div>
    </section>

    <section class="column" aria-labelledby="themes-title">
      <div class="card-inset">
          <div class="velvet-section-heading">
            <div class="velvet-section-title">
              <span class="marker" aria-hidden="true">//</span>
              <h2 id="themes-title">Four designs to publish in</h2>
            </div>
            <p>
              Each is a whole page rather than a palette: its own typefaces, its
              own shapes, its own way of drawing a month of days. They ship with
              Velvet, so a page names one and gets it, and nothing has to be
              assembled from thirty colour fields to arrive somewhere nobody
              designed.
            </p>
          </div>
          <!-- The cut, defined once. Zero-sized and hidden, because it is a
               definition rather than a drawing. -->
          <svg width="0" height="0" aria-hidden="true" focusable="false" class="shape-defs">
            <defs>
              <clipPath id="velvet-theme-tile" clipPathUnits="objectBoundingBox">
                <path d={TILE_CONTENT_PATH} transform={TILE_CONTENT_TRANSFORM} />
              </clipPath>
            </defs>
          </svg>
          <ul class="themes">
            {#each GALLERY_DESIGNS as design (design.id)}
              <li>
                <figure>
                  <span class="shot">
                    <SquircleFrame.Outline
                      width={TILE_WIDTH}
                      height={TILE_HEIGHT}
                    />
                    <img
                      src={design.picture}
                      alt={`A Velvet status page in the ${design.name} design`}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <figcaption>
                    {design.name} <span class="era">{design.era}</span>
                  </figcaption>
                </figure>
              </li>
            {/each}
          </ul>
      </div>
    </section>

    <section class="column" aria-labelledby="manual-title">
      <StepCard.Root>
        <div class="card-inset">
          <div class="velvet-section-heading">
            <div class="velvet-section-title">
              <span class="marker" aria-hidden="true">//</span>
              <h2 id="manual-title">Read it in your terminal</h2>
            </div>
            <p>
              Velvet ships three manual pages: velvet(7) for the architecture,
              velvet-config(1) for the local Configurator, and velvet.yml(5) for
              every configuration option there is. They install into your own
              home directory and ask for no administrator rights.
            </p>
          </div>
          <div class="manual">
            <CodeBlock
              code={MAN_PAGES_INSTALL}
              language="sh"
              copyable
              label="Copy these commands"
            />
            <a
              class="velvet-button velvet-button--secondary"
              href={MAN_PAGES_ARCHIVE}
              download
            >
              <Icon name="document-download" />
              <span>Download the manual</span>
            </a>
          </div>
        </div>
      </StepCard.Root>
    </section>

    <section class="closing column" aria-labelledby="start-title">
      <h2 id="start-title">Ready in a couple of minutes</h2>
      <p>
        The browser setup asks for a repository and page name, your services,
        and an optional custom domain. After you approve it on GitHub it creates
        the repository, enables Pages, starts monitoring, and waits for the
        first deployment.
      </p>
      <a class="velvet-button velvet-button--primary" href={ONBOARDING_URL}>
        <Icon name="flash" />
        <span>Create your status page</span>
      </a>
    </section>
  </main>

  <SiteFooter />
</div>

<style>
  .website-shell {
    /* The same tokens the onboarding defines, so a visitor crossing from here
       into setup does not meet a second palette. */
    --setup-accent: var(--velvet-accent);
    --setup-base: var(--velvet-base);
    --setup-panel: var(--velvet-surface-card);
    --setup-panel-raised: var(--velvet-surface-raised);
    --setup-text: var(--velvet-text);
    --setup-muted: var(--velvet-text-muted);
    --setup-control-height: 2.75rem;
    --setup-text-body: var(--velvet-text-body);
    --setup-text-copy: var(--velvet-text-copy);
    --setup-text-intro: var(--velvet-text-intro);
    --setup-text-small: var(--velvet-text-small);
    --setup-font: var(--velvet-font);
    --setup-heading-font: var(--velvet-font-heading);
    --tool-brand-accent: var(--setup-accent);
    --tool-brand-text: var(--setup-text);
    --tool-brand-heading-font: var(--setup-heading-font);

    min-height: 100vh;
    font-family: var(--setup-font);
    font-size: var(--setup-text-body);
  }
  /* The page itself spans the window and each section decides how wide it sits,
     rather than the picture escaping a narrower parent. A viewport-width
     breakout would include the scrollbar on systems that reserve room for one,
     which is horizontal scrolling nobody asked for. */
  main {
    display: grid;
    gap: 3.5rem;
    padding: clamp(2.5rem, 6vw, 4.5rem) 0 6rem;
  }
  /* The site's own measure, shared with the header and the footer, so the
     page reads as one column rather than as three of different widths. */
  .column {
    width: min(100% - 2 * var(--velvet-page-inset), var(--velvet-page-width));
    justify-self: center;
  }
  .hero {
    display: grid;
    justify-items: center;
    text-align: center;
  }
  .brand-block {
    width: min(100%, 270px);
    --tool-brand-width: 100%;
    --tool-brand-wordmark-size: clamp(3.5rem, 16vw, 4rem);
    --tool-brand-subtitle-size: clamp(0.95rem, 2.5vw, 1.2rem);
    --tool-brand-scale-gap: 0.625rem;
    --tool-brand-subtitle-gap: 0.9rem;
  }
  .lead {
    margin: 3.5rem 0 0;
    color: color-mix(in srgb, var(--setup-muted) 78%, var(--setup-text));
    font-size: var(--setup-text-intro);
    line-height: 1.3;
  }
  /* Both buttons the same width, which a flex row cannot do without giving one
     of them a length. The columns take their size from the wider label, so the
     pair stays balanced whatever the labels say. */
  .hero-actions {
    display: inline-grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: 0.75rem;
    margin-top: 2.5rem;
  }
  /* Only what this page's buttons do differently: they stand alone in a hero
     rather than sitting in a card footer, so they are roomier. */
  .velvet-button {
    min-width: 7rem;
    padding-inline: 1.1rem;
  }
  .velvet-button i {
    font-size: 1.25em;
  }
  .velvet-button :global(svg) {
    width: 1.25em;
    height: 1.25em;
  }
  /* The one section that is not a column. It spans the window as a band with a
     rule above and below, whilst the picture inside stays the size it was. */
  .showcase {
    display: grid;
    border-top: 1px solid color-mix(in srgb, var(--setup-muted) 26%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--setup-muted) 26%, transparent);
  }
  /* Carries the band's colour and the fade, so the two rules stay solid from
     edge to edge whilst the tint behind the picture dissolves before it
     reaches them. Both layers are stacked here rather than on the section for
     that reason. */
  /* The tint behind the screenshot, supplied here rather than baked into the
     picture, so it runs out to both edges whilst the picture stays the size it
     was. Partly transparent, so the board backdrop keeps showing through
     rather than being covered by a solid panel. */
  .showcase-plate {
    display: grid;
    justify-items: center;
    padding: 2.5rem 1rem 1.5rem;
    /* The page's own indigo and violet, kept quiet. The contrast in this
       section is meant to come from the themed page in the picture, so the
       surface behind it stays part of the site. */
    background: linear-gradient(
      135deg,
      rgba(21, 24, 36, 0.55) 0%,
      rgba(36, 42, 77, 0.55) 38%,
      rgba(58, 44, 82, 0.55) 74%,
      rgba(74, 47, 87, 0.55) 100%
    );
    -webkit-mask-image: linear-gradient(
      to right,
      transparent 0,
      #000 30%,
      #000 70%,
      transparent 100%
    );
    mask-image: linear-gradient(
      to right,
      transparent 0,
      #000 30%,
      #000 70%,
      transparent 100%
    );
  }
  /* The picture is transparent apart from the window and its shadow, so it
     needs no rounding or shadow of its own here. */
  /* The link is the grid item, and a centred grid item is sized by its
     contents. With the picture still loading those contents are narrower than
     the cap, so the width has to be stated here rather than on the image, or
     the band reserves too little and the cards below it move when the file
     arrives. Measured at 208px short on a desktop width before this. */
  /* The link is the grid item, and a centred grid item is sized by its
     contents. With the picture still loading those contents are narrower than
     the cap, so the width has to be stated here rather than on the image, or
     the band reserves too little and the cards below it move when the file
     arrives. Measured at 208px short on a desktop width before this. */
  .showcase-plate a {
    width: 100%;
    /* The tube is its own frame now, so this is the width of the screen itself
       rather than of a window plus the transparent margin around it. Smaller
       than that window was, because a screen showing a page reads at a size a
       screen would be rather than at the size of a picture of one. */
    max-width: 720px;
  }
  .showcase img {
    width: 100%;
    height: auto;
    display: block;
    /* Claims the box before the picture is fetched. Stated here rather than
       left to the width and height attributes, because the picture loads
       lazily and the ratio has to hold whilst it is still absent. It is the
       file's own, 2010 by 1536. */
    aspect-ratio: 4 / 3;
  }
  .card-inset {
    padding: var(--step-card-content-inset, 16px);
  }

  .marker {
    color: var(--setup-accent);
    font-family: var(--setup-heading-font);
    font-size: var(--velvet-text-heading);
    font-weight: 600;
    line-height: 1.1;
  }
  h2 {
    margin: 0;
    color: var(--setup-text);
    font-family: var(--setup-heading-font);
    font-size: var(--velvet-text-heading);
    font-weight: 600;
    letter-spacing: -0.025em;
  }
  .velvet-section-heading p {
    margin: 0;
    color: var(--setup-muted);
    font-size: var(--setup-text-copy);
    line-height: 1.5;
  }
  .capabilities,
  .pipeline {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Three across rather than two, so each card is nearer square. A squircle far
     from square reads as a capsule, and these are the shortest cards on the
     page. Narrower cards need a wider share of themselves kept clear, because
     the icon sits at the left where the curve has already begun to pull in. */
  .capabilities {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  /*
    A card inside a card. It lifts itself off the one behind it with the raised
    surface, and takes a smaller safe inset than the outer card because it is
    wide and shallow: the curve pulls in hardest towards the corners, and on a
    box far from square the vertical share of a percentage inset is already
    generous. The minimum height keeps it from flattening into a capsule, which
    is what a squircle becomes when its box is.
  */
  .capabilities li,
  .pipeline li {
    /* Lifted off the card behind it, and translucent to the same degree, so the
       board shows through both rather than through one of them. */
    --squircle-card-surface: color-mix(
      in srgb,
      var(--velvet-surface-raised) 74%,
      transparent
    );
    /* Turned down, because a card inside another does not need to cast as far
       as the one it sits in. */
    --squircle-card-shadow-strength: 0.16;
    --squircle-card-safe-inset: 7.5%;
    display: grid;
    min-height: 14rem;
  }
  /* The narrower of the two, and its icon sits at the left where the curve has
     already begun to pull in, so it keeps a wider share of itself clear. */
  .capabilities li {
    --squircle-card-safe-inset: 10.5%;
  }
  .entry {
    display: flex;
    align-items: start;
    gap: 0.85rem;
  }
  .capabilities :global(svg) {
    color: var(--setup-accent);
    width: var(--velvet-text-ornament);
    height: var(--velvet-text-ornament);
  }
  .pipeline-number {
    flex: none;
    color: var(--setup-accent);
    font-family: var(--setup-heading-font);
    font-size: var(--velvet-text-ornament);
    font-weight: 600;
    line-height: 1;
  }
  h3 {
    margin: 0 0 0.3rem;
    color: var(--setup-text);
    font-size: var(--setup-text-body);
    font-weight: 650;
  }
  /* One step up the scale from the text beneath it, so the title of a card
     leads rather than merely starting the paragraph. */
  .capabilities h3,
  .pipeline h3 {
    font-size: var(--velvet-text-copy);
  }
  /* A step up from the site's small text, because these paragraphs carry the
     substance of both sections rather than annotating something else. */
  .capabilities p,
  .pipeline p {
    margin: 0;
    color: var(--setup-muted);
    font-size: var(--velvet-text-body);
    line-height: 1.5;
  }
  /* Two across, because a status page in a quarter of this card is too small
     to read anything from. */
  .themes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .themes figure {
    display: grid;
    gap: 0.6rem;
    margin: 0;
  }
  /* The tile carries the shape and the picture fills it, because a squircle is
     a path rather than a radius and a path clips the box it is set on. The
     ratio is claimed before the file arrives, so the cards below do not move
     when it does. */
  .shape-defs {
    position: absolute;
    width: 0;
    height: 0;
  }
  .themes .shot {
    color: color-mix(in srgb, var(--velvet-text-muted) 55%, transparent);
    position: relative;
    display: block;
    aspect-ratio: 5 / 4;
  }
  /* Fills the shape rather than sitting inside it, cut at the inner edge of the
     wide line so the frame closes around it. A status page is taller than it is
     wide, so a tile near square shows the headline, the range row and several
     services rather than a headline and one row of days. The pictures are
     photographed at five by four, which is the ratio above, so filling crops
     nothing. */
  .themes img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    clip-path: url(#velvet-theme-tile);
  }
  .themes figcaption {
    text-align: center;
    color: var(--setup-muted);
    font-size: var(--setup-text-small);
    font-weight: 650;
  }

  /* The period a design belongs to, which is half of what its name means. It
     stays inline rather than becoming a flex item, because the space between
     the two is a real space: whitespace between flex items is dropped, and the
     caption would then be read aloud as one word. Set apart by weight rather
     than by a colour of its own, since the caption is already the quietest
     text on the page. */
  .themes .era {
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  /* The commands and the button sit side by side whilst there is room for
     both, and the block of commands takes whatever the button leaves. */
  .manual {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
  }
  /* The block takes whatever the button leaves, and scrolls inside itself
     rather than reporting its longest line upwards as a minimum width. */
  .manual :global(.code-block) {
    flex: 1 1 22rem;
    min-width: 0;
  }
  .closing {
    display: grid;
    justify-items: center;
    gap: 1rem;
    text-align: center;
  }
  .closing p {
    margin: 0;
    color: var(--setup-muted);
    font-size: var(--setup-text-copy);
    line-height: 1.5;
  }
  .closing .velvet-button {
    margin-top: 0.5rem;
  }

  @media (max-width: 720px) {
    .capabilities,
    .pipeline,
    /* A status page shown a third of a phone wide says nothing about a theme,
       so the previews take the full column here rather than half of it. */
    .themes {
      grid-template-columns: 1fr;
    }
    /* Stacked once a row of two would be cramped, still matching each other. */
    .hero-actions {
      grid-auto-flow: row;
    }
  }
</style>
