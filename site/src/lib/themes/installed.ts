/// <reference types="vite/client" />

/**
 * Every theme installed beside this build, gathered at build time.
 *
 * The gallery has to show a theme without a server to ask, so the themes are
 * pulled into the build rather than fetched. The
 * globs are static because a themer cannot follow a name it only learns at run
 * time; which file of a theme is its template and which is its stylesheet is
 * still decided by the manifest, and the globs merely make every candidate
 * reachable.
 *
 * This module is for a browser. Anything on the build side reads the same
 * directories off disk through `site/scripts/themes.ts`, which needs no
 * bundler at all.
 */

import type { ThemeData, ThemeScript } from "./data.js";
import type { ThemeManifest } from "./manifest.js";
import { THEMES } from "./catalogue.js";

/** A theme, with the pieces a preview or a gallery needs. */
export interface InstalledTheme {
  manifest: ThemeManifest;
  /** Builds the markup from the data it is given. */
  template: (data: ThemeData) => string;
  /** The theme's whole stylesheet, as text. */
  css: string;
  /**
   * Attaches the theme's behaviour to markup that already exists.
   *
   * A preview never calls it, because choosing how a page should look is not
   * using the page. The gallery does, because a theme is not reviewable
   * without its ranges, its disclosures and its readings.
   */
  script: ThemeScript;
}

const moduleFiles = import.meta.glob("/theme-bundles/*/**/*.ts", {
  eager: true,
}) as Record<string, Record<string, unknown>>;

const styleFiles = import.meta.glob("/theme-bundles/*/**/*.css", {
  eager: true,
  query: "?inline",
  import: "default",
}) as Record<string, string>;

/** Reads the themes once, because the globs cannot change whilst a page runs. */
function collect(): InstalledTheme[] {
  const themes: InstalledTheme[] = [];
  for (const manifest of THEMES) {
    const directory = `/theme-bundles/${manifest.id}`;
    const templateModule = moduleFiles[`${directory}/${manifest.entries.template}`];
    const scriptModule = moduleFiles[`${directory}/${manifest.entries.script}`];
    const css = styleFiles[`${directory}/${manifest.entries.styles}`];
    const template = (templateModule?.default ?? templateModule?.template) as
      | ((data: ThemeData) => string)
      | undefined;
    const script = (scriptModule?.default ?? scriptModule?.enhance) as
      | ThemeScript
      | undefined;
    if (
      typeof template !== "function" ||
      typeof script !== "function" ||
      typeof css !== "string"
    ) {
      continue;
    }
    themes.push({ manifest, template, css, script });
  }
  return themes.sort((left, right) =>
    left.manifest.id.localeCompare(right.manifest.id),
  );
}

/** Every installed theme, in name order. */
export const INSTALLED_THEMES: readonly InstalledTheme[] = collect();

/** One theme by the name an installation would use for it. */
export function installedTheme(id: string): InstalledTheme | undefined {
  return INSTALLED_THEMES.find((theme) => theme.manifest.id === id);
}
