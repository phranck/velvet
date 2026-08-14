/**
 * The themes a page can be published in, as everything but the build reads them.
 *
 * Every theme describes itself in its own `velvet-theme.toml`, and a build step
 * writes all four into `theme-catalogue.generated.json`, because neither Vite
 * nor a browser reads TOML. This module is that catalogue.
 *
 * Two surfaces offer them: the start page shows what a page can look like, and
 * the setup asks which one to publish in. Both read this, so the two cannot come
 * to disagree about which themes exist, in which order, or under which name.
 *
 * Nothing here is Vite's. A theme's picture has to be resolved by a bundler and
 * lives in `theme-pictures.ts` for that reason, so this module can be read by a
 * test runner and by the build alike.
 */

import catalogue from "./catalogue.generated.json";
import type { ThemeManifest } from "./manifest.js";

/** One theme, as it is offered. */
export interface Theme extends ThemeManifest {
  /** The picture's file name inside `src/assets/themes/`. */
  picture: string;
}

/** Every theme that ships, in the order they are offered. */
export const THEMES: readonly Theme[] = catalogue as ReadonlyArray<Theme>;

/**
 * The themes somebody choosing one is shown.
 *
 * A withdrawn theme keeps every installation already published in it, so it
 * stays in the catalogue and is offered to nobody new.
 */
export const OFFERED_THEMES: readonly Theme[] = THEMES.filter(
  (theme) => theme.state === "offered",
);

/**
 * Finds the theme a configuration names.
 *
 * Every theme rather than the offered ones, because an installation published
 * in a withdrawn theme still has to be able to say which one it is in.
 *
 * @param id - A theme directory name, as `statusPage` carries it.
 * @returns The theme, or nothing when no shipped theme answers to that name.
 */
export function themeById(id: string): Theme | undefined {
  return THEMES.find((theme) => theme.id === id);
}
