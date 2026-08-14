/// <reference types="vite/client" />

/**
 * Every design installed beside this build, gathered at build time.
 *
 * The gallery has to show a design without a server to ask, so the bundles are
 * pulled into the build rather than fetched. The
 * globs are static because a bundler cannot follow a name it only learns at run
 * time; which file of a bundle is its template and which is its stylesheet is
 * still decided by the manifest, and the globs merely make every candidate
 * reachable.
 *
 * This module is for a browser. Anything on the build side reads the same
 * directories off disk through `site/scripts/bundles.ts`, which needs no
 * bundler at all.
 */

import type { BundleData, BundleScript } from "./data.js";
import type { BundleManifest } from "./manifest.js";
import { THEMES } from "../themes.js";

/** A design, with the pieces a preview or a gallery needs. */
export interface InstalledDesign {
  manifest: BundleManifest;
  /** Builds the markup from the data it is given. */
  template: (data: BundleData) => string;
  /** The design's whole stylesheet, as text. */
  css: string;
  /**
   * Attaches the design's behaviour to markup that already exists.
   *
   * A preview never calls it, because choosing how a page should look is not
   * using the page. The gallery does, because a design is not reviewable
   * without its ranges, its disclosures and its readings.
   */
  script: BundleScript;
}

const moduleFiles = import.meta.glob("/theme-bundles/*/**/*.ts", {
  eager: true,
}) as Record<string, Record<string, unknown>>;

const styleFiles = import.meta.glob("/theme-bundles/*/**/*.css", {
  eager: true,
  query: "?inline",
  import: "default",
}) as Record<string, string>;

/** Reads the designs once, because the globs cannot change whilst a page runs. */
function collect(): InstalledDesign[] {
  const designs: InstalledDesign[] = [];
  for (const manifest of THEMES) {
    const directory = `/theme-bundles/${manifest.id}`;
    const templateModule = moduleFiles[`${directory}/${manifest.entries.template}`];
    const scriptModule = moduleFiles[`${directory}/${manifest.entries.script}`];
    const css = styleFiles[`${directory}/${manifest.entries.styles}`];
    const template = (templateModule?.default ?? templateModule?.template) as
      | ((data: BundleData) => string)
      | undefined;
    const script = (scriptModule?.default ?? scriptModule?.enhance) as
      | BundleScript
      | undefined;
    if (
      typeof template !== "function" ||
      typeof script !== "function" ||
      typeof css !== "string"
    ) {
      continue;
    }
    designs.push({ manifest, template, css, script });
  }
  return designs.sort((left, right) =>
    left.manifest.id.localeCompare(right.manifest.id),
  );
}

/** Every installed design, in name order. */
export const INSTALLED_DESIGNS: readonly InstalledDesign[] = collect();

/** One design by the name an installation would use for it. */
export function installedDesign(id: string): InstalledDesign | undefined {
  return INSTALLED_DESIGNS.find((design) => design.manifest.id === id);
}
