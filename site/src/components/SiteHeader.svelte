<script lang="ts">
  import { VELVET_VERSION } from "../lib/velvet-version.generated.js";
  import RainbowScale from "./RainbowScale.svelte";
  import VelvetWordmark from "./VelvetWordmark.svelte";

  /**
   * The bar across the top of every velvet.li page.
   *
   * One component rather than one header per page, because the three pages
   * beside the start page had each written their own and they differed only in
   * a class name. The current page is marked with `aria-current` so a reader
   * using the navigation knows where they already are, and coloured with the
   * accent so they can see it without reading.
   *
   * The links are absolute paths rather than relative ones, because the pages
   * sit at different depths and a relative path would resolve differently on
   * each of them.
   */
  let {
    current,
  }: {
    current?: "documentation" | "changelog" | "references" | "attributions";
  } = $props();

  /**
   * The four pages the bar offers, without icons.
   *
   * The labels are set in the label face at a size where an icon beside them
   * would be the larger of the two, and four uppercase words read as a row of
   * their own without anything pointing at them.
   */
  const SECTIONS = [
    { id: "documentation", label: "Documentation", href: "/documentation" },
    { id: "changelog", label: "Changelog", href: "/changelog" },
    { id: "references", label: "References", href: "/references" },
    { id: "attributions", label: "Attributions", href: "/attributions" },
  ] as const;
</script>

<!--
  Two elements rather than one: the band spans the window and carries the blur,
  whilst the row inside it keeps the page measure, so the wordmark starts where
  the text beneath it does whilst the frosted edge runs to both sides.
-->
<div class="band">
  <header class="site-header velvet-page">
    <!--
      The version stands beside the mark rather than inside the link, because it
      says which Velvet this is and pressing it should not go anywhere. The link
      keeps the mark and its scale alone, so the scale still takes its width
      from the word above it rather than from the wider row.
    -->
    <div class="brand">
      <a class="home" href="/" aria-label="Velvet, back to the start page">
        <VelvetWordmark />
        <!--
          The same scale the start page draws beneath the mark, in a bar-sized
          version of itself. Drawn from the one component rather than written out
          again here, so the nine colours and their order exist in one place.
        -->
        <span class="scale" aria-hidden="true">
          <RainbowScale />
        </span>
      </a>
      <span class="version">
        <!--
          The same double slash the onboarding sets before a step title, hidden
          from a reader using a screen reader, who would otherwise hear two
          slashes read out before the number.
        -->
        <span aria-hidden="true">//</span>
        v{VELVET_VERSION}
      </span>
    </div>

    <nav aria-label="Main">
      <ul>
        {#each SECTIONS as section (section.id)}
          <li>
            <a
              href={section.href}
              aria-current={section.id === current ? "page" : undefined}
            >
              {section.label}
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  </header>
</div>

<style>
  /* Frosted rather than solid, so the page keeps travelling underneath it
     whilst the text on the bar stays readable over whatever scrolls past. */
  .band {
    position: sticky;
    top: 0;
    z-index: 20;
    /* Saturated as well as blurred, so what passes under the bar keeps its
       colour instead of greying out the way a plain blur leaves it. */
    backdrop-filter: blur(18px) saturate(1.4);
    -webkit-backdrop-filter: blur(18px) saturate(1.4);
    background: color-mix(in srgb, var(--velvet-base) 68%, transparent);
    border-bottom: 1px solid var(--velvet-rule);
  }
  /* The inset comes from `.velvet-page`, which every page on the site shares,
     so the wordmark starts exactly where the text beneath it does. */
  .site-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1.5rem;
    padding: 1.375rem 0;
  }
  /* The mark and the version sit on one row, aligned along their bottom edges
     rather than centred, so the number reads as a subtext of the mark instead
     of floating beside it. The bottom edge rather than the baseline, because
     the mark carries the scale beneath it and the baseline it would align to
     is the word's, which leaves the number sitting on top of the colours. */
  .brand {
    display: flex;
    align-items: flex-end;
    gap: 1.125rem;
  }
  /* The mark is sized by the brand rather than by the text scale, because it is
     a mark and not a heading. Everything else in this bar takes a token. */
  .home {
    display: block;
    color: inherit;
    font-size: 1.625rem;
    text-decoration: none;
  }
  /* A version is a literal rather than prose, so it takes the label face along
     with everything else in this bar that is not a sentence. It sits clear of
     the bottom of the row, because the mark beside it ends at its scale and a
     number level with those colours reads as part of them.

     It is one flat tone rather than the gradient it carried before. The bar now
     holds four labels in the same face and size, and a fifth drawn differently
     from all of them read as a control rather than as a note. */
  .version {
    margin-bottom: 0.5625rem;
    color: var(--velvet-text-dim);
    font-family: var(--velvet-font-label);
    font-size: var(--velvet-text-label);
    font-weight: 700;
    letter-spacing: var(--velvet-tracking-label);
    line-height: 1;
    white-space: nowrap;
  }
  /* The slashes lead the eye from the mark to the number, so they are drawn in
     the edge colour: present enough to point, quiet enough not to be read as a
     word of their own. */
  .version span {
    color: var(--velvet-edge);
  }
  /* Thinner than the start page's, which stands at 5px under a mark four times
     this size. Its width follows the mark above it rather than being set, so
     the two ends of the scale meet the two ends of the word. */
  .home .scale {
    display: block;
    height: 2px;
    margin-top: 0.4375rem;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  nav a {
    display: block;
    padding: 0.625rem 1.125rem;
    /* Its own, rather than the radius a card gives what sits inside it. Nothing
       here is nested in a card: these are items in a bar, and taking that value
       only meant they moved whenever a card's padding did. */
    border-radius: 12px;
    color: var(--velvet-text-muted);
    font-family: var(--velvet-font-label);
    font-size: var(--velvet-text-label);
    font-weight: 700;
    letter-spacing: var(--velvet-tracking-label);
    line-height: 1;
    text-transform: uppercase;
    text-decoration: none;
  }

  nav a:hover,
  nav a:focus-visible {
    color: var(--velvet-text);
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  /* The page a reader is already on: the accent, over the accent kept faint
     behind it. Colour alone would ask a reader to compare two tones against
     each other before knowing where they are. */
  nav a[aria-current="page"] {
    color: var(--velvet-accent);
    background: var(--velvet-accent-tint);
  }
  /* Hovering the current page must not wash its tint away, which the shared
     hover rule would do by replacing the background with a neutral one. */
  nav a[aria-current="page"]:hover,
  nav a[aria-current="page"]:focus-visible {
    color: var(--velvet-accent);
    background: color-mix(in srgb, var(--velvet-accent) 16%, transparent);
  }

  /* Narrow enough and the row cannot hold four labels at this tracking, so the
     items give up their side padding first and wrap onto a second line after
     that. The labels themselves stay: without icons they are the only thing an
     item has to say. */
  @media (max-width: 560px) {
    nav a {
      padding: 0.5rem 0.5rem;
      letter-spacing: 0.06em;
    }
  }
</style>
