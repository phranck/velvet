<script lang="ts">
  import VelvetWordmark from "./VelvetWordmark.svelte";

  /**
   * The bar across the top of every velvet.li page.
   *
   * One component rather than one header per page, because the three pages
   * beside the start page had each written their own and they differed only in
   * a class name. The current page is marked with `aria-current` so a reader
   * using the navigation knows where they already are.
   *
   * The links are absolute paths rather than relative ones, because the pages
   * sit at different depths and a relative path would resolve differently on
   * each of them.
   */
  let { current }: { current?: "documentation" | "changelog" | "references" } =
    $props();

  /** Where a visitor goes to install Velvet, which is the point of the site. */
  const ONBOARDING_URL = "https://setup.velvet.li/onboarding/";

  const SECTIONS = [
    { id: "documentation", label: "Documentation", href: "/documentation" },
    { id: "changelog", label: "Changelog", href: "/changelog" },
    { id: "references", label: "References", href: "/references" },
  ] as const;
</script>

<header class="site-header">
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
            {section.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <a class="velvet-button velvet-button--primary start" href={ONBOARDING_URL}>
    <i class="ph-duotone ph-rocket-launch" aria-hidden="true"></i>
    <span>Create your status page</span>
  </a>
</header>

<style>
  .site-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem 1.5rem;
    padding: 1.25rem clamp(1rem, 5vw, 4rem);
  }
  .home {
    color: inherit;
    font-size: 1.5rem;
    text-decoration: none;
  }
  /* Takes the space between the wordmark and the button, so the three links
     sit beside the wordmark rather than against the far edge. */
  nav {
    flex: 1;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  nav a {
    color: var(--velvet-text-muted, #9aa3b2);
    font-size: 0.9375rem;
    text-decoration: none;
  }
  nav a:hover,
  nav a:focus-visible {
    color: var(--velvet-text);
  }
  /* The page a reader is already on, marked rather than left to the colour
     alone so it is legible without seeing the difference between two greys. */
  nav a[aria-current="page"] {
    color: var(--velvet-text);
    text-decoration: underline;
    text-underline-offset: 0.35em;
  }
  .start {
    /* Roomier than a card footer's button, matching the start page's own. */
    min-width: 7rem;
    padding: 0 1.1rem;
    white-space: nowrap;
  }
  .start i {
    font-size: 1.25em;
  }

  /* Narrow enough and the button no longer fits beside the links. It goes to a
     row of its own and spans it, which is where a primary action belongs on a
     phone anyway. */
  @media (max-width: 720px) {
    .site-header {
      gap: 0.875rem 1.25rem;
    }
    .start {
      flex: 1 0 100%;
    }
  }
</style>
