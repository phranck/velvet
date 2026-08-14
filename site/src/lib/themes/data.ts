/**
 * The status data a theme is handed, and the version stamped on it.
 *
 * This is the one thing every theme shares. A theme receives an object of
 * this shape, already loaded and already validated, and displays it. It fetches
 * nothing of its own, so nothing about a theme can depend on a network being
 * reachable from wherever the page happens to be published.
 *
 * The shape carries a version because a theme outlives the release that
 * produced it: a theme somebody wrote against version 1 must either keep
 * working or be refused outright, and refusing it is only possible if it said
 * which version it understood. `THEME_DATA_VERSION` is what the host serves
 * today, `SUPPORTED_THEME_DATA_VERSIONS` is everything it can still serve, and
 * a manifest naming anything else is rejected before a single byte of its
 * stylesheet is loaded.
 *
 * Raising the version is for a change a theme cannot survive: a field removed,
 * a field renamed, or the meaning of one changed. Adding a field a theme may
 * ignore is not that, and does not raise it.
 */

import type { VelvetLayout } from "../config.js";
import type {
  IncidentsDocument,
  RangeKey,
  ResponseTimesDocument,
  StatusDocument,
} from "../types.js";

/** The version of the data shape the host hands to a theme today. */
export const THEME_DATA_VERSION = 1;

/**
 * Every version the host can still hand out.
 *
 * A theme names exactly one of these in its manifest. The list exists so that
 * the day a second version arrives, themes written against the first keep
 * rendering rather than going dark on somebody's status page.
 */
export const SUPPORTED_THEME_DATA_VERSIONS: readonly number[] = [
  THEME_DATA_VERSION,
];

/**
 * Whether the host can serve a theme that asks for this version.
 *
 * @param version - The `dataVersion` a manifest declares.
 * @returns True where the host still hands out that shape.
 */
export function servesDataVersion(version: number): boolean {
  return SUPPORTED_THEME_DATA_VERSIONS.includes(version);
}

/** One entry in the navigation an installation configured. */
export interface ThemeNavigationLink {
  title: string;
  href: string;
}

/**
 * What the installation is, as opposed to what it measured.
 *
 * Everything here comes from the operator's configuration rather than from a
 * monitor run, and every field is something at least one theme puts on the
 * page. A theme is free to ignore any of it; the conformance suite names the
 * three that must appear somewhere, which are the version, the serial and the
 * line saying where the page was configured.
 */
export interface ThemeSite {
  /** The name the operator gave the installation. */
  name: string;
  /** The navigation links, in the order they were configured. */
  navigation: readonly ThemeNavigationLink[];
  /** Whether services share one card or each gets its own. */
  layout: VelvetLayout;
  /** The range a visitor sees before choosing one. */
  defaultRange: RangeKey;
  /** The running number this installation was issued, where it has one. */
  serial: number | null;
  /** The Velvet release that built the page. */
  version: string;
  /** Per-service icon keys the operator chose, by service identifier. */
  icons: Readonly<Record<string, string>>;
}

/**
 * Everything a theme is given, in one object.
 *
 * The three documents are the contract documents unchanged, so a theme reads
 * exactly what the monitor wrote and the arithmetic in `site/src/lib/data.ts`
 * computes from the same values a theme shows.
 */
export interface ThemeData {
  /** The shape's own version, matching what the theme's manifest declares. */
  dataVersion: number;
  /** The moment the data was generated, which is what a page reports as "now". */
  generatedAt: string;
  /** The installation, as configured. */
  site: ThemeSite;
  /** Services and their daily availability. */
  status: StatusDocument;
  /** Incidents and maintenance windows. */
  incidents: IncidentsDocument;
  /** Response time samples per service and protocol. */
  responseTimes: ResponseTimesDocument;
}

/**
 * What a theme's template exports: markup built from the data it was given.
 *
 * A string rather than a tree, because the same function has to run in two
 * places that share no DOM: the build, which writes the page before any script
 * exists, and the browser, which renders a preview into a frame. A tree would
 * force the build to carry a DOM implementation to serialise it.
 */
export type ThemeTemplate = (data: ThemeData) => string;

/**
 * What a theme's script exports: behaviour attached to markup that already
 * exists.
 *
 * It is handed the element the template's markup was put into, and the same
 * data the template rendered from. Anything it returns is called when the page
 * goes away, which is what lets a preview frame swap one theme for another
 * without leaving observers and listeners behind.
 */
export type ThemeScript = (
  root: HTMLElement,
  data: ThemeData,
) => void | (() => void);
