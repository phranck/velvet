<script lang="ts">
  let {
    href,
    target,
    rel,
  }: {
    href?: string;
    target?: "_blank" | "_parent" | "_self" | "_top";
    rel?: string;
  } = $props();
</script>

{#if href}
  <a class="velvet-wordmark" {href} {target} {rel}>Velvet</a>
{:else}
  <span class="velvet-wordmark">Velvet</span>
{/if}

<style>
  .velvet-wordmark {
    color: inherit;
    font-family: "Plaster", sans-serif;
    font-size: var(--velvet-wordmark-size, 1em);
    font-style: normal;
    font-weight: 400;
    letter-spacing: normal;
    line-height: 1;
    text-decoration: none;
  }
</style>
