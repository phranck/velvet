/**
 * The module `site/vite.bundle-page.ts` generates for the design an
 * installation named.
 *
 * Declared rather than written, because its contents depend on which design is
 * being built: it imports that bundle's stylesheet and script and nothing else.
 * A build with no design named never asks for it.
 */
declare module "virtual:velvet-design" {
  /** Hands the design the element it was rendered into, and its data. */
  export function mountDesign(): void;
}
