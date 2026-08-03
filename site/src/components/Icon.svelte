<script lang="ts">
  import { ICONS, type IconName } from "../lib/iconsax.generated.js";

  /**
   * One Iconsax icon, drawn inline.
   *
   * Inline rather than a font or a sprite, because that is the form the
   * Iconsax licence permits: the drawing is part of this code rather than a
   * file redistributed beside it.
   *
   * It takes its colour from the text around it and its size from the font
   * size, so a caller sizes it the way it sized the icon font before: set
   * `font-size` on the element, or pass a size.
   *
   * The Bulk style draws two layers, the lower one at reduced alpha. Both come
   * from the generated module, so nothing here decides how an icon looks.
   */
  let {
    name,
    size = "1em",
    class: className = "",
  }: { name: IconName; size?: string; class?: string } = $props();
</script>

<svg
  class={className}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  {#each ICONS[name] as layer, index (index)}
    <path d={layer.d} opacity={layer.opacity} fill="currentColor" />
  {/each}
</svg>

<style>
  svg {
    flex: none;
    display: inline-block;
    vertical-align: -0.125em;
  }
</style>
