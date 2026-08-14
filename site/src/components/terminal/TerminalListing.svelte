<script lang="ts">
  /**
   * What the man-page terminal prints on its screen.
   *
   * Its own component rather than part of the case, because a case is a case:
   * the machine in the opening section of the start page shows a picture on the
   * same screen, and a terminal that could only ever print this listing would
   * have been two components pretending to be one.
   *
   * **The commands are marked one element each.** That is what lets the page's
   * script read a command back whole however the glass happened to wrap it, so
   * what a reader sees and what the key copies cannot differ.
   *
   * **The confirmation is printed at all times and only revealed.** It holds
   * its width either way, so no line on the screen moves when the key is
   * pressed.
   *
   * @param commands - The lines the machine offers, which are the ones its key
   *   copies.
   */
  let { commands }: { commands: readonly string[] } = $props();

  /**
   * The banner above the commands.
   *
   * A machine of this vintage announced itself before it did anything, and the
   * greeting is the one every terminal on a screen has been quoting since 1983.
   */
  const BANNER = "UNIX System V Release 3.2";
  const RULE = "===========================================================";
  const GREETING = "GREETINGS PROFESSOR FALKEN";
  const SUBJECT = "** Velvet man pages **";
  const MAN_PAGES = "velvet(7) velvet.yml(5)";
  const COPIED = "* COPIED *";
</script>

<div class="listing">
  <div class="banner">
    <span class="dim">{BANNER}</span>
    <span class="copied" data-terminal-copied>{COPIED}</span>
  </div>
  <div class="dim">{RULE}</div>
  <div class="blank"></div>
  <div>{GREETING}</div>
  <div class="blank"></div>
  <div class="subject">{SUBJECT}</div>
  {#each commands as command (command)}
    <div>
      <span class="prompt" aria-hidden="true">$</span><span
        data-terminal-command>{command}</span
      >
    </div>
  {/each}
  <div class="blank"></div>
  <div class="pages">
    {MAN_PAGES}<span class="caret" aria-hidden="true"></span>
  </div>
</div>

<style>
  /*
    Sized in `cqw` against the tube, which is a size container, so the listing
    scales with the machine rather than with the window: a terminal shown small
    keeps its proportions instead of showing four words per line.
  */
  .listing {
    width: 60ch;
    max-width: 100%;
    font: 400 3.04cqw/1.5 var(--velvet-font-heading);
  }
  .banner {
    display: flex;
    justify-content: space-between;
    gap: 1em;
  }
  .dim {
    opacity: 0.5;
  }
  /* Printed at all times and only revealed, so the line it sits on keeps its
     width and nothing on the screen moves when the key is pressed. */
  .copied {
    visibility: hidden;
    margin-right: 1ch;
  }
  /* The blank lines a terminal leaves between one part of its output and the
     next. An empty line of its own height, which is what the machine would
     actually have printed, rather than a margin between two paragraphs. */
  .blank {
    height: 1.5em;
  }
  .subject {
    opacity: 0.75;
  }
  .prompt {
    opacity: 0.6;
  }
  .pages {
    opacity: 0.55;
  }
  /* The block a terminal leaves where the next character would go. It blinks by
     stepping between two states rather than fading, because that is what a
     hardware cursor does. */
  .caret {
    display: inline-block;
    width: 0.5em;
    height: 1.05em;
    margin-left: 0.6em;
    background: currentColor;
    vertical-align: -0.15em;
    animation: velvet-caret 1.1s step-end infinite;
  }
  @keyframes velvet-caret {
    0%,
    49% {
      opacity: 1;
    }
    50%,
    100% {
      opacity: 0;
    }
  }

  /* The caret says nothing the listing does not, so it simply rests. */
  @media (prefers-reduced-motion: reduce) {
    .caret {
      animation: none;
    }
  }
</style>
