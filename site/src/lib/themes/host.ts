/**
 * The host: what turns a theme plus an installation's data into a page.
 *
 * Three things had to be decided rather than assumed, and this module is where
 * two of them live. The third, prerendering, is decided in
 * `site/vite.theme-page.ts`, because it is a property of the build.
 *
 * **How an installation names its theme.** `velvet.yml` carries
 * `statusPage.theme`, which reaches the page as `theme` in `config.json`. An
 * installation that names nothing gets the page Velvet publishes today; the
 * themes are opt-in until the themes themselves are themes.
 *
 * **What happens when the name is unknown, or the theme declares a data
 * version the host cannot serve.** The build stops, and says which themes
 * exist or which versions are served. It does not fall back to another theme.
 * The name comes from the operator's own configuration, so a typo is fixed in a
 * second, whilst a silent fallback means an operator can never tell whether
 * their choice took effect — and the page they are looking at is somebody
 * else's theme under their own domain. A stopped build also leaves the last
 * published page exactly as it was, which is the safer of the two failures for
 * a page people open when something is already broken.
 */

import type { VelvetConfig } from "../config.js";
import type {
  IncidentsDocument,
  ResponseTimesDocument,
  StatusDocument,
} from "../types.js";
import { VELVET_VERSION } from "../velvet-version.generated.js";
import {
  THEME_DATA_VERSION,
  servesDataVersion,
  SUPPORTED_THEME_DATA_VERSIONS,
  type ThemeData,
} from "./data.js";
import type { ThemeManifest } from "./manifest.js";

/** Either the theme an installation asked for, or why it cannot be served. */
export type BundleSelection =
  | { ok: true; manifest: ThemeManifest }
  | { ok: false; reason: string };

/**
 * Picks the theme an installation named.
 *
 * @param name - What `config.json` says, which may be nothing.
 * @param available - Every theme the build found, in name order.
 * @returns The manifest, or the sentence a build failure prints.
 */
export function selectTheme(
  name: string | undefined,
  available: readonly ThemeManifest[],
): BundleSelection {
  if (name === undefined || name.trim() === "") {
    return { ok: false, reason: "this installation names no theme" };
  }
  const wanted = name.trim();
  const manifest = available.find((candidate) => candidate.id === wanted);
  if (!manifest) {
    const names = available.map((candidate) => candidate.id).sort();
    return {
      ok: false,
      reason:
        names.length === 0
          ? `there is no theme called "${wanted}", and no themes are installed`
          : `there is no theme called "${wanted}"; the themes installed are ${names.join(", ")}`,
    };
  }
  if (!servesDataVersion(manifest.dataVersion)) {
    return {
      ok: false,
      reason: `the theme "${wanted}" reads status data version ${manifest.dataVersion}, and this release serves ${SUPPORTED_THEME_DATA_VERSIONS.join(", ")}`,
    };
  }
  return { ok: true, manifest };
}

/** The three documents a page is rendered from. */
export interface BundleDocuments {
  status: StatusDocument;
  incidents: IncidentsDocument;
  responseTimes: ResponseTimesDocument;
}

/**
 * Assembles what a theme is handed.
 *
 * The three documents go across unchanged, because a theme reads exactly what
 * the monitor wrote. Everything else is the installation as its operator
 * configured it, which is the only place a theme may learn any of it: a theme
 * never reads `config.json` itself, and never learns anything by inspecting the
 * document it was rendered into.
 *
 * @param config - The installation's runtime configuration.
 * @param documents - The three contract documents.
 * @param version - The Velvet release that built the page.
 * @returns The object handed to the template and to the script.
 */
export function themeDataFor(
  config: VelvetConfig,
  documents: BundleDocuments,
  version: string = VELVET_VERSION,
): ThemeData {
  return {
    dataVersion: THEME_DATA_VERSION,
    generatedAt: documents.status.generatedAt,
    site: {
      name: config.name,
      navigation: config.navbar.map((link) => ({
        title: link.title,
        href: link.href,
      })),
      layout: config.layout,
      defaultRange: config.defaultRange,
      serial: config.serial ?? null,
      version,
      icons: { ...config.icons },
    },
    status: documents.status,
    incidents: documents.incidents,
    responseTimes: documents.responseTimes,
  };
}

/**
 * The layout a theme will actually render in.
 *
 * An operator may have configured `cards` whilst the theme they chose supports
 * only `grouped`. The theme wins, because the theme is what they can see and
 * a layout it does not support is one it cannot draw.
 *
 * @param manifest - The chosen theme.
 * @param configured - What the installation asked for.
 * @returns The layout to hand the theme.
 */
export function layoutFor(
  manifest: ThemeManifest,
  configured: ThemeData["site"]["layout"],
): ThemeData["site"]["layout"] {
  return manifest.layouts.includes(configured)
    ? configured
    : (manifest.layouts[0] ?? "grouped");
}
