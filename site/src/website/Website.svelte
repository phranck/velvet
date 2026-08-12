<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import RainbowScale from "../components/RainbowScale.svelte";
  import SiteFooter from "../components/SiteFooter.svelte";
  import SiteHeader from "../components/SiteHeader.svelte";
  import VelvetWordmark from "../components/VelvetWordmark.svelte";
  import * as Terminal from "../components/terminal";
  import * as SquircleCard from "../components/squircle-card";
  // The README's screenshot, imported from where it already lives rather than
  // copied here, so the page and the repository can never show different ones.
  // The same capture without a window around it, because the frame is drawn
  // around it here. `docs/screenshot.png` keeps its window for the README,
  // which is read on a page that has none.
  import screenshotUrl from "./assets/screenshot-screen.png";
  // The designs a page can be published in, read from the manifests that ship
  // with Velvet, so this page cannot offer one that does not exist or miss one
  // that does.
  import { GALLERY_DESIGNS } from "./design-gallery.js";
  import * as SquircleButton from "../components/squircle-button";
  import {
    SQUIRCLE_CONTENT_INSET,
    createSquircleRectPath,
  } from "../lib/squircle.js";

  /**
   * A box a framed picture is drawn in, and the squircle cut inside it.
   *
   * Nominal sizes rather than measured ones, because this page ships as
   * prerendered HTML and loads no script. The picture is cut at the inner edge
   * of the wide line, which is what `SQUIRCLE_CONTENT_INSET` names. The cut is
   * stated as a path in that box and applied with
   * `clipPathUnits="objectBoundingBox"`, so the transform is what maps the box
   * onto the 0 to 1 space that unit expects.
   *
   * **The box has to carry the ratio the frame is drawn at.** The frame keeps
   * its own proportions inside whatever element it is given, so a box stated at
   * five by four inside an element at four by three is scaled down to fit and
   * floats in the middle of it. Measured on the opening section before this:
   * the frame painted 439 wide in a box 470 wide and stood 16 clear of its own
   * left edge.
   *
   * Two boxes, therefore, because the two pictures genuinely differ. The
   * screenshot is a capture at four by three; a design tile is nearer square,
   * so that a status page in half a row still shows several services rather
   * than a headline and one row of days.
   *
   * @param width - How wide the box is stated, which only sets the resolution
   *   the path is computed at. The frame is drawn at whatever size the element
   *   turns out to be.
   * @param ratio - Width against height, which is the part that matters.
   */
  function pictureBox(width: number, ratio: number, inset: number) {
    const height = width / ratio;
    return {
      width,
      height,
      path: createSquircleRectPath(width, height, inset),
      transform: `scale(${1 / width} ${1 / height})`,
    };
  }

  /**
   * The screenshot is cut at the inner edge of the double frame around it, and
   * a design tile at its own edge.
   *
   * The two frames are different frames, because the design uses them for
   * different things. The screenshot carries Velvet's double outline, a thin
   * line and a thick one with a gap between, which is the one place the design
   * spends it. A tile carries a single hairline, drawn as a box the colour of
   * the line holding a box the size of the picture, so the cut it needs is the
   * shape at its own edge rather than a share of the way in.
   */
  const SHOT_BOX = pictureBox(470, 4 / 3, SQUIRCLE_CONTENT_INSET);
  const TILE_BOX = pictureBox(576, 5 / 4, 0);

  /**
   * The keys on this page, which are wider than they are tall.
   *
   * A word like "Download" needs the width, and a key that took it by growing
   * taller would stand above the row it sits in. Stated once because three
   * sections place one and a row of keys at different proportions is a row of
   * different keys.
   */
  const KEY_HEIGHT = "5.3125rem";
  const KEY_RATIO = 102 / 85;

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
  ] as const;

  /**
   * What an installation gives you, drawn from the README so the page and the
   * repository cannot describe the product differently.
   *
   * Each carries the one word its card is filed under. The number comes from
   * the position rather than being written down, so inserting one in the middle
   * cannot leave two cards claiming the same figure.
   */
  const CAPABILITIES = [
    {
      topic: "Checks",
      title: "Checks that run on GitHub",
      description:
        "Direct IPv4 GET and HEAD checks from GitHub-hosted runners, every five minutes, with response-time samples four times a day.",
    },
    {
      topic: "Incidents",
      title: "Incidents that open themselves",
      description:
        "A confirmed failure opens a GitHub issue, and a recovery closes it. Planned maintenance stays visible as a neutral event in the history.",
    },
    {
      topic: "History",
      title: "A history worth keeping",
      description:
        "Availability, response times, incidents, and maintenance, kept on a dedicated branch rather than in a database, for as far back as you ask for.",
    },
    {
      topic: "Designs",
      title: "A page somebody designed",
      description:
        "Curated designs, each shipped whole with the typefaces it uses, plus service icons, SEO output, and selectable history ranges.",
    },
    {
      topic: "Domain",
      title: "Your own domain",
      description:
        "Published through GitHub Pages, with a custom domain when you want one, and no server or database anywhere in the picture.",
    },
    {
      topic: "Secrecy",
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
        "GitHub Pages renders the status page, its social card, and its SEO files, whether or not the setup service is up.",
    },
  ];
</script>

<!--
  The shell rather than the mount point carries the site class here, because on
  this page it is the shell that holds the bar, the content, and the credit.
-->
<div class="website-shell velvet-site">
  <SiteHeader />

  <!--
    The cut every picture on the page takes, defined once. Zero-sized and
    hidden, because it is a definition rather than a drawing.
  -->
  <svg
    width="0"
    height="0"
    aria-hidden="true"
    focusable="false"
    class="shape-defs"
  >
    <defs>
      <clipPath id="velvet-shot-cut" clipPathUnits="objectBoundingBox">
        <path d={SHOT_BOX.path} transform={SHOT_BOX.transform} />
      </clipPath>
      <clipPath id="velvet-tile-cut" clipPathUnits="objectBoundingBox">
        <path d={TILE_BOX.path} transform={TILE_BOX.transform} />
      </clipPath>
    </defs>
  </svg>

  <main>
    <section class="hero">
      <!--
        The light and the rings the opening section sits in. All of it is
        decoration and none of it is announced: what the section says is in the
        two columns above it.
      -->
      <div class="orbit" aria-hidden="true">
        <span class="ring ring-outer"></span>
        <span class="ring ring-inner"></span>
        <span class="orbit-track"><span class="orbit-mark"></span></span>
      </div>

      <div class="hero-inner velvet-page">
        <div class="hero-text">
          <p class="status-line">
            <span class="status-lamp"></span>
            All systems nominal
          </p>

          <!--
            The mark at the size the page is named at, with the scale taking its
            width from the word above it rather than from the column, so the two
            ends of the colours meet the two ends of the letters.
          -->
          <span class="hero-brand">
            <VelvetWordmark />
            <span class="hero-scale" aria-hidden="true">
              <RainbowScale />
            </span>
          </span>

          <h1>
            <!-- The one break on the site placed by hand, asked for
                 deliberately. It balances the line at the width the opening is
                 read at, and the rule against hand-set breaks holds
                 everywhere else. -->
            Status pages,<br />flown from orbit
          </h1>
          <p class="lead">
            <!-- The same sentence the README opens with, so the public page and
                 the repository cannot end up describing Velvet differently. A
                 test holds the two together, which is why changing this one
                 meant changing that one. -->
            Velvet monitors websites and HTTP endpoints from GitHub Actions and
            publishes a polished status page through GitHub Pages.
            <!-- Two lines after the long sentence, and the breaks are the
                 content rather than a way of balancing it: what makes the claim
                 is the cadence of what Velvet does without, then how long it
                 takes. They are stated here rather than left to wrapping,
                 because a wrap would put the pair together at some widths and
                 apart at others, which is the one thing this arrangement cannot
                 survive. -->
            <br />No extra server. No database.
            <br />Just five steps away.
          </p>

          <div class="hero-actions">
            <SquircleButton.Root
              href={ONBOARDING_URL}
              label="Create your status page"
              variant="primary"
              size={KEY_HEIGHT}
              ratio={KEY_RATIO}
              data-onboarding-link
            >
              <SquircleButton.Icon><Icon name="flash" /></SquircleButton.Icon>
              <SquircleButton.Label>Create</SquircleButton.Label>
            </SquircleButton.Root>
            <SquircleButton.Root
              href={REPOSITORY_URL}
              label="Github, read the source"
              size={KEY_HEIGHT}
              ratio={KEY_RATIO}
              target="_blank"
              rel="noopener noreferrer"
            >
              <SquircleButton.Icon>
                <i class="ph-duotone ph-github-logo"></i>
              </SquircleButton.Icon>
              <SquircleButton.Label>Github</SquircleButton.Label>
            </SquircleButton.Root>
          </div>
        </div>

        <!--
          The same machine the man pages are read off, in anthracite rather than
          brass, so the page opens on the thing it closes on and a reader meets
          one object twice rather than two.

          Decoration for anything reading the page aloud, and out of the tab
          order with it: everything this link leads to is already reachable from
          the key beside it.
        -->
        <a
          class="hero-shot"
          href={ONBOARDING_URL}
          tabindex="-1"
          aria-hidden="true"
        >
          <Terminal.Root finish="anthracite">
            <img
              src={screenshotUrl}
              alt="A Velvet status page showing services, uptime bars, and a response-time chart"
              width="1770"
              height="1328"
              fetchpriority="high"
              decoding="async"
            />
          </Terminal.Root>
        </a>
      </div>
    </section>

    <section class="band" aria-labelledby="capabilities-title">
      <div class="velvet-page">
        <div class="velvet-section-heading">
          <div class="velvet-section-title">
            <span class="marker" aria-hidden="true">//</span>
            <h2 id="capabilities-title">What an installation gives you</h2>
          </div>
          <p>
            Checks run on GitHub-hosted runners, incidents live in GitHub
            Issues, and the result is published as a beautiful static page.
          </p>
        </div>
        <ul class="capabilities">
          {#each CAPABILITIES as capability, index (capability.title)}
            <li>
              <SquircleCard.Root>
                <SquircleCard.Body>
                  <div class="entry">
                    <p class="eyebrow">
                      {String(index + 1).padStart(2, "0")}
                      <span aria-hidden="true">/</span>
                      {capability.topic}
                    </p>
                    <h3>{capability.title}</h3>
                    <p class="entry-copy">{capability.description}</p>
                  </div>
                </SquircleCard.Body>
              </SquircleCard.Root>
            </li>
          {/each}
        </ul>
      </div>
    </section>

    <section class="band band-deep" aria-labelledby="pipeline-title">
      <div class="velvet-page">
        <div class="velvet-section-heading">
          <div class="velvet-section-title">
            <span class="marker" aria-hidden="true">//</span>
            <h2 id="pipeline-title">How it works</h2>
          </div>
          <p>
            Four steps, and every one of them happens inside your own
            repository. You write down what should be watched, GitHub runs the
            checks on its own schedule, each run leaves its result on a branch
            of its own, and the page is built from that result. Nothing in this
            waits on a service of ours, so your page goes on building whether
            or not anything of ours is running.
          </p>
        </div>
        <ol class="pipeline">
          {#each PIPELINE as stage, index (stage.title)}
            <li>
              <span class="pipeline-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{stage.title}</h3>
              <p>{stage.description}</p>
            </li>
          {/each}
        </ol>
      </div>
    </section>

    <section class="band" aria-labelledby="themes-title">
      <div class="velvet-page">
        <div class="velvet-section-heading">
          <div class="velvet-section-title">
            <span class="marker" aria-hidden="true">//</span>
            <h2 id="themes-title">Different designs to start from</h2>
          </div>
          <p>
            Four of them are finished and tested today, and you pick one while
            you set your page up. Each arrives whole, with the typefaces it is
            drawn in and the icons it needs, so a published page asks nobody
            else for anything. The choice is a field in your configuration, so
            changing your mind later is a change to one file rather than a
            rebuild. There will be more as time goes on, and if you have a
            particular one in mind,
            <a class="mail" href="mailto:themerequest@velvet.li"
              >write to us<Icon name="sms" /></a
            >.
          </p>
        </div>
        <ul class="themes">
          {#each GALLERY_DESIGNS as design (design.id)}
            <li>
              <figure>
                <!-- The design's own construction: a shape in the colour of the
                     line, holding a shape the size of the picture one pixel
                     inside it. One hairline, following the curve, and nothing
                     to keep in step with a second. -->
                <span class="shot-seat">
                  <span class="shot">
                  <span class="shot-wall">
                  <span class="shot-picture">
                    <img
                      src={design.picture}
                      alt={`A Velvet status page in the ${design.name} design`}
                      loading="lazy"
                      decoding="async"
                    />
                    <span class="shot-shade" aria-hidden="true"></span>
                  </span>
                  </span>
                  </span>
                </span>
                <!--
                  The period stays beside the name, because it is half of what
                  the name means: the mockup's caption carries the name alone,
                  but shortening a caption in a picture of a page is not the
                  same as deciding a reader no longer needs the year.

                  It stays inline rather than becoming a flex item, because the
                  space between the two is a real space: whitespace between flex
                  items is dropped, and the caption would then be read aloud as
                  one word. Set apart by colour rather than by weight, because
                  the label face is carried at one weight and asking for a
                  lighter one would get the same file back.
                -->
                <figcaption>
                  {design.name} <span class="era">{design.era}</span>
                </figcaption>
              </figure>
            </li>
          {/each}
        </ul>
      </div>
    </section>

    <section class="band band-deep" aria-labelledby="manual-title">
      <div class="manual velvet-page">
        <Terminal.Root commands={MAN_PAGES_INSTALL}>
          <Terminal.Listing commands={MAN_PAGES_INSTALL} />
        </Terminal.Root>

        <div class="manual-text">
          <h2 id="manual-title">Read it in your terminal</h2>
          <p>
            There are man pages for the architecture, velvet(7), for the
            Configurator, velvet-config(1), and for every option there is,
            velvet.yml(5). They install into your home directory and ask for no
            administrator rights.
          </p>
          <p>
            In time Velvet will be workable from a terminal alone. A command
            line tool for that is still to come.
          </p>
          <SquircleButton.Root
            href={MAN_PAGES_ARCHIVE}
            label="Download the manual"
            size={KEY_HEIGHT}
            ratio={KEY_RATIO}
            download
          >
            <SquircleButton.Icon>
              <Icon name="document-download" />
            </SquircleButton.Icon>
            <SquircleButton.Label>Download</SquircleButton.Label>
          </SquircleButton.Root>
        </div>
      </div>
    </section>

    <section class="band closing" aria-labelledby="start-title">
      <div class="velvet-page">
        <h2 id="start-title">Ready in a couple of minutes</h2>
        <p>
          The browser setup asks for a repository, your services, an optional
          domain and one of our curated designs. After you approve it on GitHub
          it does the rest.
        </p>
        <SquircleButton.Root
          href={ONBOARDING_URL}
          label="Create your status page"
          variant="primary"
          size={KEY_HEIGHT}
          ratio={KEY_RATIO}
        >
          <SquircleButton.Icon><Icon name="flash" /></SquircleButton.Icon>
          <SquircleButton.Label>Create</SquircleButton.Label>
        </SquircleButton.Root>
      </div>
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
    --setup-text-lead: var(--velvet-text-lead);
    --setup-text-intro: var(--velvet-text-intro);
    --setup-text-small: var(--velvet-text-small);
    --setup-font: var(--velvet-font);
    --setup-heading-font: var(--velvet-font-heading);

    min-height: 100vh;
    font-family: var(--setup-font);
    font-size: var(--setup-text-body);
  }

  /* Nothing between the sections. Each draws its own rule at the top, so the
     page reads as a column of bands rather than as a stack of cards floating
     on a backdrop. */
  main {
    display: block;
  }

  .shape-defs {
    position: absolute;
    width: 0;
    height: 0;
  }

  /*
    The opening section, and the only one with light behind it.

    It clips, because the rings are drawn larger than the section and hang off
    its top right corner. Positioned so they can.
  */
  .hero {
    position: relative;
    overflow: hidden;
    padding-block: clamp(3rem, 7vw, 4.75rem) clamp(3.5rem, 8vw, 5.25rem);
    background: radial-gradient(
      120% 90% at 80% 8%,
      var(--velvet-hero-glow) 0%,
      var(--velvet-base) 60%
    );
  }

  /*
    The rings, and the mark travelling around them.

    Anchored to the section's top right corner rather than to the column, so
    they keep the same relation to the light behind them however wide the window
    is. The mark is a child of a box the size of the outer ring, and that box is
    what turns: one transform on one element, which is what keeps the whole
    thing on the compositor rather than laying the page out again every frame.
  */
  .orbit {
    position: absolute;
    top: -190px;
    right: -140px;
    width: 660px;
    height: 660px;
    pointer-events: none;
  }
  .ring {
    position: absolute;
    border-radius: 50%;
  }
  .ring-outer {
    inset: 0;
    border: 1px solid var(--velvet-orbit-ring);
  }
  .ring-inner {
    top: 70px;
    right: 70px;
    width: 520px;
    height: 520px;
    border: 1px solid var(--velvet-orbit-ring-inner);
  }
  .orbit-track {
    position: absolute;
    inset: 0;
    animation: velvet-orbit var(--velvet-orbit-period) linear infinite;
  }
  .orbit-mark {
    position: absolute;
    top: -5px;
    left: 50%;
    width: 10px;
    height: 10px;
    margin-left: -5px;
    border-radius: 50%;
    background: var(--velvet-accent);
  }
  @keyframes velvet-orbit {
    to {
      transform: rotate(360deg);
    }
  }

  /* The two columns the opening is read in: what it says, and what it looks
     like. The picture is given a length and the text takes the rest, because
     the picture has a size it wants to be read at whilst the text does not. */
  .hero-inner {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 470px;
    gap: 3.25rem;
    align-items: center;
  }

  /* The line above the mark, which says the product is up by being a working
     instance of the thing it sells. */
  .status-line {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    margin: 0 0 1.75rem;
    color: var(--velvet-accent);
    font-family: var(--velvet-font-label);
    font-size: var(--velvet-text-label);
    font-weight: 700;
    letter-spacing: var(--velvet-tracking-wide);
    line-height: 1;
    text-transform: uppercase;
  }
  /* The operational colour, so it means the same thing here as it does on a
     status page. */
  .status-lamp {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--velvet-operational);
    animation: velvet-lamp 3.2s ease-in-out infinite;
  }
  @keyframes velvet-lamp {
    0%,
    100% {
      opacity: 0.4;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.4);
    }
  }

  /* Sized by the word it holds, so the scale beneath spans exactly the mark. */
  .hero-brand {
    --velvet-wordmark-size: clamp(3.25rem, 8vw, 5.75rem);

    display: block;
    width: fit-content;
    line-height: 0.92;
  }
  .hero-scale {
    display: block;
    height: 5px;
    margin-top: 1.125rem;
  }

  /* Only the size differs from the title every other page carries; the leading
     is the one the site states, so two headings in the same face do not sit at
     two different rhythms. */
  .hero-text h1 {
    margin: 1.875rem 0 1.25rem;
    color: var(--velvet-text);
    font-size: var(--velvet-text-intro);
    text-transform: uppercase;
    text-wrap: pretty;
  }
  /* No measure of its own. The column it sits in is already the measure, and a
     paragraph capped short of it reads as text breaking in the middle of the
     available space, because that is what it is. Measured before this: the cap
     stood at 480px in a column 678 wide, so every line broke 198px early. The
     column cannot run away either, since the page is capped at 1200 and the
     picture beside it holds a fixed 470. */
  .lead {
    margin: 0 0 2.25rem;
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-lead);
    line-height: 1.55;
    text-wrap: pretty;
  }
  /* The keys are square-ish and size themselves, so the row places them and
     states no width of its own. */
  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .hero-shot {
    display: block;
  }
  /* The tube states the shape and clips it, so the picture only has to fill it.
     Its own four by three matches the glass, so filling crops nothing. */
  .hero-shot :global(img) {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    object-position: top center;
  }

  /* Every section below the opening: a rule at the top and one measure inside,
     with the deeper ones set a shade back so two neighbours are told apart
     without either drawing a box. */
  .band {
    padding-block: clamp(3rem, 6vw, 5rem);
    border-top: 1px solid var(--velvet-rule);
  }
  .band-deep {
    background: var(--velvet-surface-band);
  }

  .marker {
    color: var(--setup-accent);
    font-family: var(--setup-heading-font);
    font-size: var(--velvet-text-heading);
    font-weight: 400;
    line-height: 1.1;
  }
  h2 {
    margin: 0;
    color: var(--setup-text);
    font-family: var(--setup-heading-font);
    font-size: var(--velvet-text-heading);
    font-weight: 400;
    letter-spacing: -0.01em;
    text-transform: uppercase;
  }
  /* A link inside one of these paragraphs, which until now none of them had.
     The accent and a rule under the words, because the paragraph is set in the
     muted colour and a link that only differs by being clickable is a link
     nobody sees. The mark sits after the words and rides the cap height, so it
     reads as belonging to them rather than sitting on the line below. */
  .velvet-section-heading p .mail {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35em;
    color: var(--velvet-accent);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
  }
  .velvet-section-heading p .mail :global(svg) {
    width: 1em;
    height: 1em;
    /* Its box has no baseline of its own, so aligning it by one puts it on the
       line. Dropped by the distance from the baseline to the middle of a
       capital, it stands centred against the word beside it. */
    transform: translateY(0.18em);
  }
  /* The heading block stands a little in from the page edge, because what
     usually follows it is rounded and a curve pulls its own content away from
     that edge. The steps below this one are not: they are columns under a rule,
     and a rule begins where the page begins. Measured before this, the heading
     and its line stood at 205 whilst the first step stood at 189. */
  section[aria-labelledby="pipeline-title"] .velvet-section-heading {
    margin-inline: 0;
  }
  /* Two thirds of the page rather than a measure of its own, so the line under
     a section heading is stated as a share of the width everything else on the
     page is held to and follows it when that width moves. */
  .velvet-section-heading p {
    margin: 0;
    max-width: calc(var(--velvet-page-width) * 2 / 3);
    color: var(--setup-muted);
    font-size: var(--setup-text-copy);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* Three across, so each card is nearer square. A squircle far from square
     reads as a capsule. The floor is what a tile measures at the page's own
     width, which keeps the shape whatever a card's text turns out to be: at
     1200px a third of the row is 387px, and three quarters of that is 290. */
  .capabilities {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .capabilities li {
    /* Lifted off the page behind it, and given a wider share of itself to keep
       clear, because the eyebrow starts at the left where the curve has already
       begun to pull in. */
    --squircle-card-surface: var(--velvet-surface-card);
    --squircle-card-safe-inset: 9%;

    display: grid;
    min-height: 18rem;
  }
  .entry {
    display: grid;
    align-content: start;
    gap: 0.75rem;
  }
  /* The line a card is filed under. The figure and the word are one label, so
     the slash between them is drawn rather than read aloud. */
  .eyebrow {
    margin: 0;
    color: var(--velvet-accent);
    font-family: var(--velvet-font-label);
    font-size: var(--velvet-text-label);
    font-weight: 700;
    letter-spacing: var(--velvet-tracking-eyebrow);
    line-height: 1;
    text-shadow: var(--velvet-text-engraved);
    text-transform: uppercase;
  }
  /* Pressed into the card rather than laid on it, which is what the card's own
     raised edge asks for: something standing above the page carries its writing
     cut into its face. */
  .entry h3 {
    margin: 0;
    color: var(--velvet-text);
    font-size: var(--velvet-text-copy);
    font-weight: 400;
    line-height: 1.22;
    text-shadow: var(--velvet-text-engraved);
  }
  .entry-copy {
    margin: 0;
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-body);
    line-height: 1.55;
    text-shadow: var(--velvet-text-engraved);
    text-wrap: pretty;
  }

  /* Four across and no cards. Each step is a rule with a number under it, so
     the section reads as a sequence rather than as four more panels. */
  .pipeline {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pipeline li {
    padding-top: 1.5rem;
    border-top: 1px solid var(--velvet-orbit-ring);
  }
  /* The one place a figure stands alone rather than beside a word, which is
     what the numeral face is for. */
  .pipeline-number {
    display: block;
    margin-bottom: 1.125rem;
    color: var(--velvet-accent);
    font-family: var(--velvet-font-numeral);
    font-size: var(--velvet-text-ornament);
    line-height: 1.1;
  }
  .pipeline h3 {
    margin: 0 0 0.625rem;
    color: var(--velvet-text);
    font-size: var(--velvet-text-copy);
    font-weight: 400;
    line-height: 1.25;
  }
  .pipeline p {
    margin: 0;
    color: var(--velvet-text-dim);
    font-size: var(--velvet-text-body);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* Two across, because a status page in a quarter of this row is too small to
     read anything from. */
  .themes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3rem var(--velvet-side-by-side-gap);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .themes figure {
    display: grid;
    gap: 1.125rem;
    margin: 0;
  }
  /* The tile carries the shape and the picture fills it, because a squircle is
     a path rather than a radius and a path clips the box it is set on. The
     ratio is claimed before the file arrives, so nothing below moves when it
     does. The pictures are photographed at five by four, so filling crops
     nothing. */
  /*
    A picture set into the page rather than laid on it.

    The edge is a band the width of the recess, drawn from shadow at the top
    through to a lit face at the bottom, which is what a surface cut into
    something looks like: the light comes from above, so the near wall of the
    cut is dark and the far one catches it. Both stops are mixed rather than
    stepped, so the band turns rather than banding.

    Drawn as a shape holding a shape, the way the design draws its tiles, so the
    band follows the curve. A border cannot: it is painted outside the padding
    box and the clip cuts it away along every corner.
  */
  /*
    The surface the cut is made in.

    A recess is a relationship between a floor and the plane around it, and this
    page has no plane: the tiles sit on flat page colour, so an edge drawn with
    a gradient reads as a bordered picture rather than as a picture set below
    something. This casts a hairline of light along the far lip, on the side the
    light comes from last, which is the one mark that says there is a surface
    there at all.

    It sits on the wrapper rather than on the shape, because a filter is applied
    before the clip on the same element and the clip would cut the light away.
  */
  .themes .shot-seat {
    display: block;
    filter: drop-shadow(-1px -1px 0 rgb(0 0 0 / 0.55))
      drop-shadow(1px 1px 0 color-mix(in srgb, var(--velvet-edge-light) 55%, transparent));
  }
  .themes .shot {
    display: block;
    padding: var(--velvet-edge-lip);
    aspect-ratio: 5 / 4;
    clip-path: url(#velvet-tile-cut);
    background: linear-gradient(
      var(--velvet-light-angle),
      var(--velvet-edge-shadow) 0%,
      var(--velvet-rule) 46%,
      var(--velvet-edge-light) 100%
    );
  }
  /*
    The wall below the lip: the same edge, a little further down and a little
    less lit.

    A second ring rather than one band with a gradient across it, because the
    band follows a curve and a gradient runs in a straight line: across the top
    of the shape the two directions agree, and down the sides they are at right
    angles to each other. Two shapes, one inside the other, dim in the direction
    the cut actually goes whatever part of the curve they are on.
  */
  .themes .shot-wall {
    display: block;
    width: 100%;
    height: 100%;
    padding: calc(var(--velvet-edge-depth) - var(--velvet-edge-lip));
    box-sizing: border-box;
    clip-path: url(#velvet-tile-cut);
    background: linear-gradient(
      var(--velvet-light-angle),
      color-mix(
          in srgb,
          var(--velvet-edge-shadow) var(--velvet-edge-inner-dim),
          #000000
        )
        0%,
      color-mix(
          in srgb,
          var(--velvet-rule) var(--velvet-edge-inner-dim),
          #000000
        )
        46%,
      color-mix(
          in srgb,
          var(--velvet-edge-light) var(--velvet-edge-inner-dim),
          #000000
        )
        100%
    );
  }
  .themes .shot-picture {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    overflow: hidden;
    clip-path: url(#velvet-tile-cut);
    background: var(--velvet-surface-card);
  }
  /*
    The shadow the near wall of the cut throws across what sits in it.

    A layer rather than an inset shadow, because an inset shadow bands the
    element's own rectangle and the clip then cuts it away at every corner,
    which leaves a shade with straight sides and open corners. This is clipped
    by the same shape the picture is, so it turns with it.

    Two shadows, one per wall. The near one reaches about half way in and is
    gone before the middle, so what it darkens is the wall of the cut and what a
    reader looks at is still the picture. The far one is barely there and barely
    wide: a lit wall still casts something where it meets what sits below it,
    and without it that edge reads as the picture ending rather than as the
    recess turning.

    The far one takes the near one's angle plus half a turn, so the two stay
    opposite each other however the light is moved.
  */
  .themes .shot-shade {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      /* Where the two walls meet, the shade gathers. A straight gradient is as
         dark along the middle of an edge as it is in the corner, and a cut
         never is: the corner is the one place light reaches from neither side.
         Placed at the corner the light comes from, which the angle names. */
      radial-gradient(
        34% 34% at 0% 0%,
        rgb(0 0 0 / 0.46) 0%,
        rgb(0 0 0 / 0.14) 40%,
        transparent 66%
      ),
      linear-gradient(
        calc(var(--velvet-light-angle) + 180deg),
        rgb(0 0 0 / 0.24) 0%,
        rgb(0 0 0 / 0.08) 3%,
        transparent 7%
      ),
      /* What the near lip throws onto the floor. Hard against the wall and gone
         within a tenth of the way in: a shadow that carries on to the middle is
         a vignette, and a vignette says photograph rather than edge. */
      linear-gradient(
        var(--velvet-light-angle),
        rgb(0 0 0 / 0.72) 0%,
        rgb(0 0 0 / 0.4) 3.5%,
        rgb(0 0 0 / 0.16) 7%,
        transparent 13%
      ),
      /* The floor itself, which lies below the surface and is lit as such. Even
         across the picture, because what makes something read as deeper is that
         all of it receives less, not that its edges are darker. */
      linear-gradient(rgb(0 0 0 / 0.14), rgb(0 0 0 / 0.14));
  }
  .themes img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    object-position: top center;
  }
  /* A step above the page's other labels. This one names a whole design rather
     than annotating something beside it, and it is the only writing under a
     picture that fills half the row. */
  .themes figcaption {
    color: var(--velvet-text-muted);
    font-family: var(--velvet-font-label);
    font-size: var(--velvet-text-small);
    font-weight: 700;
    letter-spacing: var(--velvet-tracking-label);
    text-align: center;
    text-transform: uppercase;
  }
  .themes .era {
    color: var(--velvet-text-dim);
    font-variant-numeric: tabular-nums;
  }

  /* The machine and what it is for, side by side and each given half the row.
     Equal columns rather than a length and a remainder, because neither is
     subordinate to the other here: one shows the commands and the other says
     what they install. */
  /*
    The machine and what it is for, side by side, at the gap the pictures above
    are set at.

    The terminal's column is 70px narrower than an even half, and the text takes
    what that leaves. The machine scales as a whole, so a narrower column is a
    smaller machine rather than a cropped one, and at an even half it stood
    larger than the paragraph it illustrates.
  */
  .manual {
    display: grid;
    grid-template-columns:
      calc((100% - var(--velvet-side-by-side-gap)) / 2 - 70px)
      minmax(0, 1fr);
    gap: var(--velvet-side-by-side-gap);
    align-items: center;
  }
  /* A column rather than a run of blocks, so the key starts where the heading
     and the paragraph start. Left to block layout the key centred itself in the
     column and sat 233px in from the text above it. */
  .manual-text {
    display: grid;
    justify-items: start;
  }
  .manual-text h2 {
    margin-bottom: 1rem;
  }
  /* No measure of its own: half the row already is one. The two paragraphs that
     do keep a cap, the one under a section heading and the one before the
     closing key, each stand in the full page width, where an uncapped line runs
     to about a hundred characters. This one stood 56px short of a column that
     was 568 wide. */
  .manual-text p {
    margin: 0 0 1rem;
    color: var(--setup-muted);
    font-size: var(--setup-text-copy);
    line-height: 1.6;
    text-wrap: pretty;
  }
  /* The last one stands clear of the key beneath it, whilst the paragraphs in
     between are only a paragraph apart. Stated on the last rather than on the
     key, because the key is a component and the room above it belongs to what
     it follows. */
  .manual-text p:last-of-type {
    margin-bottom: 2.5rem;
  }

  .closing :global(.velvet-page) {
    display: grid;
    justify-items: center;
    gap: 1rem;
    text-align: center;
  }
  .closing h2 {
    font-size: var(--velvet-text-title);
    letter-spacing: -0.02em;
    line-height: 1.02;
  }
  .closing p {
    margin: 0 0 1.25rem;
    max-width: 39rem;
    color: var(--setup-muted);
    font-size: var(--setup-text-copy);
    line-height: 1.6;
    text-wrap: pretty;
  }

  /* Neither the ring nor the lamp says anything the page does not say in words,
     so both simply stop rather than being replaced by something quieter. */
  @media (prefers-reduced-motion: reduce) {
    .orbit-track,
    .status-lamp {
      animation: none;
    }
  }

  /* The picture stops earning its column before the text does, so the opening
     stacks first and the rows below it follow further down. */
  @media (max-width: 960px) {
    .hero-inner {
      grid-template-columns: minmax(0, 1fr);
      gap: 2.5rem;
    }
    .capabilities,
    .pipeline {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    /*
      Stacked, and the case stops overhanging.

      Once the terminal has the whole column there is nothing beside it to
      overhang into but the page's own inset, and that inset is narrower than
      the overhang on a phone: measured at a 375px window, the case reached 4px
      past the document and the whole page scrolled sideways.
    */
    .manual {
      grid-template-columns: minmax(0, 1fr);
      gap: 3rem;
    }
  }
  @media (max-width: 720px) {
    .capabilities,
    .pipeline,
    /* A status page shown a third of a phone wide says nothing about a design,
       so the previews take the full column here rather than half of it. */
    .themes {
      grid-template-columns: minmax(0, 1fr);
    }
    /* The rings are drawn for a wide window and crowd the text on a narrow one,
       where there is no column beside them for them to sit over. */
    .orbit {
      display: none;
    }
  }
</style>
