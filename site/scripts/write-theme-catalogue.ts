/**
 * Writes the catalogue: what every theme says about itself, as one file a
 * browser can read.
 *
 * A theme describes itself in `velvet-theme.toml`, and TOML is Bun's to read.
 * Vite does not import it and a browser does not parse it, so everything on the
 * browser's side of that seam reads this file instead: the start page showing
 * what a page can look like, the setup asking which theme to publish in, and
 * the configurator drawing a control for every feature.
 *
 * It is generated rather than maintained, because a list kept beside the
 * directories is a list that drifts from them. The directory is the list, the
 * order comes from each theme's own file, and this only collects them.
 *
 * The picture each theme is shown with comes from the same file the screenshot
 * run writes, so a theme has one picture and one place that says which.
 *
 * Usage: bun scripts/write-theme-catalogue.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ThemeManifest } from "../src/lib/themes/manifest.js";
import { readThemes } from "./themes.js";

/** Where the catalogue is written. */
const OUTPUT = resolve(
  import.meta.dirname,
  "../src/lib/themes/catalogue.generated.json",
);

/** Where the screenshot run records which picture belongs to which theme. */
const PICTURES = resolve(
  import.meta.dirname,
  "../src/assets/themes/manifest.json",
);

/** One theme, as everything on the browser's side of the seam reads it. */
export interface CatalogueEntry extends ThemeManifest {
  /** The picture's file name inside `src/assets/themes/`. */
  picture: string;
}

/** As much of the picture manifest as this reads. */
interface PictureManifest {
  themes: Record<string, { file: string }>;
}

/**
 * Builds the catalogue from the themes on disk.
 *
 * @returns One entry per theme, in the order they are offered.
 * @throws Where a theme's manifest does not parse, or has no picture. Both
 *   stop the build rather than publishing a catalogue that is missing one.
 */
export async function buildThemeCatalogue(): Promise<CatalogueEntry[]> {
  const pictures = JSON.parse(await readFile(PICTURES, "utf8")) as PictureManifest;
  const themes = await readThemes();
  const entries: CatalogueEntry[] = [];
  for (const theme of themes) {
    if (!theme.manifest) {
      throw new Error(
        `${theme.directory} does not describe itself: ${theme.manifestErrors.join("; ")}`,
      );
    }
    const picture = pictures.themes[theme.directory]?.file;
    if (!picture) {
      throw new Error(
        `${theme.directory} has no picture in src/assets/themes/manifest.json`,
      );
    }
    entries.push({ ...theme.manifest, picture });
  }
  // Sorted by what each theme says about where it stands, so the order is the
  // themes' own rather than the order a directory happened to be read in.
  return entries.sort((left, right) => left.order - right.order);
}

/** The catalogue as it is written, so a gate can compare text with text. */
export async function themeCatalogueText(): Promise<string> {
  return `${JSON.stringify(await buildThemeCatalogue(), null, 2)}\n`;
}

if (import.meta.main) {
  const text = await themeCatalogueText();
  await writeFile(OUTPUT, text, "utf8");
  console.log(`Wrote ${JSON.parse(text).length} themes to the catalogue.`);
}
