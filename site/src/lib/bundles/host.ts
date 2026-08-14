/**
 * The host: what turns a bundle plus an installation's data into a page.
 *
 * Three things had to be decided rather than assumed, and this module is where
 * two of them live. The third, prerendering, is decided in
 * `site/vite.bundle-page.ts`, because it is a property of the build.
 *
 * **How an installation names its bundle.** `velvet.yml` carries
 * `statusPage.design`, which reaches the page as `design` in `config.json`. An
 * installation that names nothing gets the page Velvet publishes today; the
 * bundles are opt-in until the designs themselves are bundles.
 *
 * **What happens when the name is unknown, or the bundle declares a data
 * version the host cannot serve.** The build stops, and says which designs
 * exist or which versions are served. It does not fall back to another design.
 * The name comes from the operator's own configuration, so a typo is fixed in a
 * second, whilst a silent fallback means an operator can never tell whether
 * their choice took effect — and the page they are looking at is somebody
 * else's design under their own domain. A stopped build also leaves the last
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
  BUNDLE_DATA_VERSION,
  servesDataVersion,
  SUPPORTED_BUNDLE_DATA_VERSIONS,
  type BundleData,
} from "./data.js";
import type { BundleManifest } from "./manifest.js";

/** Either the design an installation asked for, or why it cannot be served. */
export type BundleSelection =
  | { ok: true; manifest: BundleManifest }
  | { ok: false; reason: string };

/**
 * Picks the bundle an installation named.
 *
 * @param name - What `config.json` says, which may be nothing.
 * @param available - Every bundle the build found, in name order.
 * @returns The manifest, or the sentence a build failure prints.
 */
export function selectBundle(
  name: string | undefined,
  available: readonly BundleManifest[],
): BundleSelection {
  if (name === undefined || name.trim() === "") {
    return { ok: false, reason: "this installation names no design" };
  }
  const wanted = name.trim();
  const manifest = available.find((candidate) => candidate.id === wanted);
  if (!manifest) {
    const names = available.map((candidate) => candidate.id).sort();
    return {
      ok: false,
      reason:
        names.length === 0
          ? `there is no design called "${wanted}", and no designs are installed`
          : `there is no design called "${wanted}"; the designs installed are ${names.join(", ")}`,
    };
  }
  if (!servesDataVersion(manifest.dataVersion)) {
    return {
      ok: false,
      reason: `the design "${wanted}" reads status data version ${manifest.dataVersion}, and this release serves ${SUPPORTED_BUNDLE_DATA_VERSIONS.join(", ")}`,
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
 * Assembles what a bundle is handed.
 *
 * The three documents go across unchanged, because a design reads exactly what
 * the monitor wrote. Everything else is the installation as its operator
 * configured it, which is the only place a design may learn any of it: a bundle
 * never reads `config.json` itself, and never learns anything by inspecting the
 * document it was rendered into.
 *
 * @param config - The installation's runtime configuration.
 * @param documents - The three contract documents.
 * @param version - The Velvet release that built the page.
 * @returns The object handed to the template and to the script.
 */
export function bundleDataFor(
  config: VelvetConfig,
  documents: BundleDocuments,
  version: string = VELVET_VERSION,
): BundleData {
  return {
    dataVersion: BUNDLE_DATA_VERSION,
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
 * The layout a design will actually render in.
 *
 * An operator may have configured `cards` whilst the design they chose supports
 * only `grouped`. The design wins, because the design is what they can see and
 * a layout it does not support is one it cannot draw.
 *
 * @param manifest - The chosen design.
 * @param configured - What the installation asked for.
 * @returns The layout to hand the design.
 */
export function layoutFor(
  manifest: BundleManifest,
  configured: BundleData["site"]["layout"],
): BundleData["site"]["layout"] {
  return manifest.layouts.includes(configured)
    ? configured
    : (manifest.layouts[0] ?? "grouped");
}
