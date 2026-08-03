<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import CodeBlock from "../components/CodeBlock.svelte";
  import SiteFooter from "../components/SiteFooter.svelte";
  import SiteHeader from "../components/SiteHeader.svelte";
  import VelvetToolBrand from "../components/VelvetToolBrand.svelte";
  import * as StepCard from "../components/step-card";
  import {
    STEP_CARD_CONTENT_INSET,
    STEP_CARD_INNER_RADIUS,
  } from "../components/step-card/geometry.js";
  // The README's screenshot, imported from where it already lives rather than
  // copied here, so the page and the repository can never show different ones.
  import screenshotUrl from "../../../docs/screenshot.png";
  // The four themes an installation can be set to, read from the registry the
  // browser setup and the Configurator read, so the page cannot advertise a
  // theme that is not offered or miss one that is.
  import { GALLERY_THEMES } from "./theme-gallery.js";

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
   */
  const MAN_PAGES_INSTALL = [
    `curl -LO https://velvet.li${MAN_PAGES_ARCHIVE}`,
    "tar -xzf velvet-man-pages.tar.gz",
    "./velvet-man-pages/install.sh",
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
      title: "A page you can shape",
      description:
        "Four system themes, detailed visual configuration, service icons, SEO output, and selectable history ranges.",
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
          <img
            src={screenshotUrl}
            alt="A Velvet status page showing services, uptime bars, and a response-time chart"
            width="2010"
            height="1536"
            fetchpriority="high"
            decoding="async"
          />
        </a>
      </div>
    </section>

    <section class="column" aria-labelledby="capabilities-title">
      <StepCard.Root>
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
                <Icon name={capability.icon} />
                <div>
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                </div>
              </li>
            {/each}
          </ul>
        </div>
      </StepCard.Root>
    </section>

    <section class="column" aria-labelledby="pipeline-title">
      <StepCard.Root>
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
                <span class="pipeline-number" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{stage.title}</h3>
                  <p>{stage.description}</p>
                </div>
              </li>
            {/each}
          </ol>
        </div>
      </StepCard.Root>
    </section>

    <section class="column" aria-labelledby="themes-title">
      <StepCard.Root>
        <div class="card-inset">
          <div class="velvet-section-heading">
            <div class="velvet-section-title">
              <span class="marker" aria-hidden="true">//</span>
              <h2 id="themes-title">Four themes to start from</h2>
            </div>
            <p>
              The browser setup offers these as preview cards and the
              Configurator edits every colour behind them, from the palette and
              the uptime grid to the response-time chart, the cards, and the
              backdrop.
            </p>
          </div>
          <ul class="themes">
            {#each GALLERY_THEMES as theme (theme.id)}
              <li>
                <figure>
                  <img
                    src={theme.picture}
                    alt={`The ${theme.name} theme on a Velvet status page`}
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption>{theme.name}</figcaption>
                </figure>
              </li>
            {/each}
          </ul>
        </div>
      </StepCard.Root>
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
        The browser setup asks for a repository and page name, your services, an
        optional custom domain, and one of the four themes. After you approve it
        on GitHub it creates the repository, enables Pages, starts monitoring,
        and waits for the first deployment.
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
    --setup-panel: rgba(27, 29, 38, 0.9);
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
    padding: 0 1.1rem;
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
  /* The tint the screenshot used to carry baked in, now supplied here so it can
     run out to both edges whilst the picture stays the size it was. Partly
     transparent, so the board backdrop keeps showing through rather than being
     covered by a solid panel. */
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
    /* Wider than the window inside it by exactly the transparent margin the
       picture carries, so the window itself lands at the size it had when the
       frame was still baked in. */
    max-width: 830px;
  }
  .showcase img {
    width: 100%;
    height: auto;
    display: block;
    /* Claims the box before the picture is fetched. Stated here rather than
       left to the width and height attributes, because the picture loads
       lazily and the ratio has to hold whilst it is still absent. It is the
       file's own, 2010 by 1536. */
    aspect-ratio: 2010 / 1536;
  }
  .card-inset {
    padding: var(--step-card-content-inset, 20px);
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
  .capabilities li,
  .pipeline li {
    display: flex;
    align-items: start;
    gap: 0.85rem;
    padding: 1rem;
    border-radius: var(--step-card-inner-radius);
    background: #222530;
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
  .capabilities p,
  .pipeline p {
    margin: 0;
    color: var(--setup-muted);
    font-size: var(--setup-text-small);
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
  .themes img {
    width: 100%;
    height: auto;
    display: block;
    border-radius: var(--step-card-inner-radius);
    /* Claimed before the file arrives, so the cards below do not move when it
       does. It is the ratio the four preview images are cut to. */
    aspect-ratio: 16 / 10;
    object-fit: cover;
    background: #0a0b0f;
  }
  .themes figcaption {
    text-align: center;
    color: var(--setup-muted);
    font-size: var(--setup-text-small);
    font-weight: 650;
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
