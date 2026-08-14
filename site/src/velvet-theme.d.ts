/**
 * The module `site/vite.theme-page.ts` generates for the theme an
 * installation named.
 *
 * Declared rather than written, because its contents depend on which theme is
 * being built: it imports that theme's stylesheet and script and nothing else.
 * A build with no theme named never asks for it.
 */
declare module "virtual:velvet-theme" {
  /** Hands the theme the element it was rendered into, and its data. */
  export function mountTheme(): void;
}
