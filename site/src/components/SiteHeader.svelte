<script lang="ts">
  import Icon from "./Icon.svelte";
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

  const SECTIONS = [
    {
      id: "documentation",
      label: "Documentation",
      href: "/documentation",
      icon: "book",
    },
    {
      id: "changelog",
      label: "Changelog",
      href: "/changelog",
      icon: "clock",
    },
    {
      id: "references",
      label: "References",
      href: "/references",
      icon: "profile-2user",
    },
    {
      id: "attributions",
      label: "Attributions",
      href: "/attributions",
      icon: "shield-tick",
    },
  ] as const;
</script>

<!--
  Two elements rather than one: the band spans the window and carries the blur,
  whilst the row inside it keeps the page measure, so the wordmark starts where
  the text beneath it does whilst the frosted edge runs to both sides.
-->
<div class="band">
  <header class="site-header velvet-page">
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

    <nav aria-label="Main">
      <ul>
        {#each SECTIONS as section (section.id)}
          <li>
            <a
              href={section.href}
              aria-current={section.id === current ? "page" : undefined}
            >
              <Icon name={section.icon} size="1.25rem" />
              <span>{section.label}</span>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
  </header>
</div>

<style>
  /* Frosted rather than solid, so the board backdrop keeps moving underneath
     it whilst the text on the bar stays readable over whatever scrolls past. */
  .band {
    position: sticky;
    top: 0;
    z-index: 20;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    background: color-mix(in srgb, var(--velvet-base) 72%, transparent);
  }
  /* The inset comes from `.velvet-page`, which every page on the site shares,
     so the wordmark starts exactly where the text beneath it does. */
  .site-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1.5rem;
    padding: 1.25rem 0;
  }
  /* The mark is sized by the brand rather than by the text scale, because it is
     a mark and not a heading. Everything else in this bar takes a token. */
  .home {
    display: block;
    color: inherit;
    font-size: 1.5rem;
    text-decoration: none;
  }
  /* Thinner than the start page's, which stands at 5px under a mark four times
     this size. Its width follows the mark above it rather than being set, so
     the two ends of the scale meet the two ends of the word. */
  .home .scale {
    display: block;
    height: 2px;
    margin-top: 0.3rem;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  nav a {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    /* Sized by what it holds rather than by a fixed height, which is what makes
       the tint behind the current page sit close around its label instead of
       standing as a block in the bar. The item measured 44px against a 20px
       icon before this, so eleven of every twenty-two were empty above and
       below. */
    padding: 0.5rem 0.75rem;
    /* Its own, rather than the radius a card gives what sits inside it. Nothing
       here is nested in a card: these are items in a bar, and taking that value
       only meant they moved whenever a card's padding did. */
    border-radius: 12px;
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-small);
    text-decoration: none;
  }

  nav a:hover,
  nav a:focus-visible {
    color: var(--velvet-text);
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  /* The page a reader is already on: the accent, over the accent at a tenth
     of its strength. The reference carries that tint on a pseudo-element,
     which is why reading the element's own background reported none. Measured
     there as the accent at 0.1 alpha. */
  nav a[aria-current="page"] {
    color: var(--velvet-accent);
    background: color-mix(in srgb, var(--velvet-accent) 10%, transparent);
  }
  /* Hovering the current page must not wash its tint away, which the shared
     hover rule would do by replacing the background with a neutral one. */
  nav a[aria-current="page"]:hover,
  nav a[aria-current="page"]:focus-visible {
    color: var(--velvet-accent);
    background: color-mix(in srgb, var(--velvet-accent) 16%, transparent);
  }

  /* Narrow enough and the labels cost more than they say, so the items keep
     their icons alone and the row stays on one line. */
  @media (max-width: 560px) {
    nav a span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    nav a {
      padding: 0 0.6rem;
    }
  }
</style>
