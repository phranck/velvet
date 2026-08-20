/**
 * The themes a page can be published in, as everything but the build reads them.
 *
 * Every theme describes itself in its own `velvet-theme.toml`, and a build step
 * writes all four into `theme-catalogue.generated.json`, because neither Vite
 * nor a browser reads TOML. This module is that catalogue.
 *
 * Three surfaces offer them: the start page shows what a page can look like,
 * the setup asks which one to publish in, and the configurator changes the one
 * a page is published in. All three read this, so none of them can come to
 * disagree about which themes exist, in which order, or under which name.
 *
 * Nothing here is Vite's. A theme's picture has to be resolved by a bundler and
 * lives in `pictures.ts` for that reason, so this module can be read by a test
 * runner and by the build alike.
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
 * The themes in a catalogue that are still offered.
 *
 * A withdrawn theme keeps every installation already published in it, so it
 * stays in the catalogue and is offered to nobody new.
 *
 * @param catalogue - The themes to sift.
 * @returns Those still on offer, in the order they were given.
 */
function offeredIn(catalogue: readonly Theme[]): readonly Theme[] {
  return catalogue.filter((theme) => theme.state === "offered");
}

/** The themes somebody choosing one is shown. */
export const OFFERED_THEMES: readonly Theme[] = offeredIn(THEMES);

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

/**
 * The themes one installation is shown when it comes to choose.
 *
 * The offered ones, plus the withdrawn one this installation is published in.
 * A withdrawn theme keeps every installation already in it and is offered to
 * nobody else, so it appears here exactly once: for the operator who is already
 * in it and has to be able to see which one that is. It stands first, because
 * that is where the one they are in belongs.
 *
 * @param published - The theme this installation is published in, or nothing
 *   where that has not been read yet.
 * @param catalogue - The themes to choose among. Every shipped theme unless a
 *   caller says otherwise, which is what lets this be measured against a
 *   withdrawn theme whilst none is withdrawn.
 * @returns The themes to offer, in the order they are offered.
 */
export function themesOfferedTo(
  published: string | null,
  catalogue: readonly Theme[] = THEMES,
): readonly Theme[] {
  const offered = offeredIn(catalogue);
  const running =
    published === null
      ? undefined
      : catalogue.find((theme) => theme.id === published);
  if (running === undefined || running.state === "offered") return offered;
  return [running, ...offered];
}

/**
 * Whether leaving the theme a page is in cannot be undone.
 *
 * True only whilst the page is still published in a withdrawn theme. That is
 * the one change nothing brings back, because a withdrawn theme is offered to
 * nobody new, so once the page is out of it there is no way to choose it again.
 * Having already moved away in this session, the answer is no: the decision was
 * taken then, and asking a second time asks about a theme nothing would return
 * to anyway.
 *
 * @param published - The theme the page is published in.
 * @param chosen - The theme standing in the configurator right now.
 * @param catalogue - The themes to look the choice up in.
 * @returns Whether moving off `chosen` is final.
 */
export function leavingIsFinal(
  published: string | null,
  chosen: string,
  catalogue: readonly Theme[] = THEMES,
): boolean {
  if (published !== chosen) return false;
  return (
    catalogue.find((theme) => theme.id === chosen)?.state === "withdrawn"
  );
}
