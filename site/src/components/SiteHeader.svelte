<script lang="ts">
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
  let { current }: { current?: "documentation" | "changelog" | "references" } =
    $props();

  const SECTIONS = [
    {
      id: "documentation",
      label: "Documentation",
      href: "/documentation",
      icon: "ph-book-open-text",
    },
    {
      id: "changelog",
      label: "Changelog",
      href: "/changelog",
      icon: "ph-clock-counter-clockwise",
    },
    {
      id: "references",
      label: "References",
      href: "/references",
      icon: "ph-users-three",
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
    </a>

    <nav aria-label="Main">
      <ul>
        {#each SECTIONS as section (section.id)}
          <li>
            <a
              href={section.href}
              aria-current={section.id === current ? "page" : undefined}
            >
              <i class={`ph-duotone ${section.icon}`} aria-hidden="true"></i>
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
    padding: 0.75rem 0;
  }
  /* The mark is sized by the brand rather than by the text scale, because it is
     a mark and not a heading. Everything else in this bar takes a token. */
  .home {
    color: inherit;
    font-size: 1.5rem;
    text-decoration: none;
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
    height: 2.75rem;
    padding: 0 0.75rem;
    border-radius: 0.5rem;
    color: var(--velvet-text-muted);
    font-size: var(--velvet-text-small);
    text-decoration: none;
  }
  nav a i {
    font-size: 1.25rem;
    line-height: 1;
  }
  nav a:hover,
  nav a:focus-visible {
    color: var(--velvet-text);
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  /* The page a reader is already on. Colour alone, as on the reference this
     follows: no rule beneath it and no filled pill, because the bar is short
     and an accent in it is read before the label is. */
  nav a[aria-current="page"] {
    color: var(--velvet-accent);
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
