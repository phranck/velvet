/**
 * Velvet runtime configuration.
 *
 * A published page reads `config.json`, which the Velvet Action generates for
 * the repository it is published from. Nothing about a specific installation is
 * baked into the build, and nothing about appearance is in here at all: a page
 * is published in a theme, and a theme carries its own.
 */

import type { FetchImplementation } from "./fetch.js";
import type { RangeKey } from "./types";

/**
 * Card layout for the service list.
 * - `grouped`: all services share one card (the default).
 * - `cards`: every service gets its own card.
 */
export type VelvetLayout = "grouped" | "cards";

export interface VelvetConfig {
  /** GitHub owner of the repository that stores Velvet data. */
  owner: string;
  /** Repository name that stores Velvet data. */
  repo: string;
  /** Canonical public URL of the status page (custom domain or GitHub Pages URL); drives SEO tags. */
  url?: string;
  /** Branch the versioned Velvet data directory lives on. */
  dataBranch: string;
  /** Base URL containing status.json, response-times.json, and incidents.json. */
  dataBaseUrl: string;
  /** Brand name shown in the navbar. */
  name: string;
  /** Optional logo URL shown in the navbar. */
  logoUrl?: string;
  /** Logo height in pixels (width scales proportionally). */
  logoHeight: number;
  /** Show the "Powered by Velvet" credit in the footer. */
  /**
   * The running number this installation was issued, if it has one.
   *
   * Written into velvet.lock.json when the setup service creates the
   * repository and read from there at build time. Absent for installations
   * made before serials existed and for repositories assembled by hand.
   */
  serial?: number;
  /** Navbar links. */
  navbar: Array<{ title: string; href: string }>;
  /**
   * The theme this installation publishes in, named by its directory.
   *
   * A name no installed theme answers to stops the build, because a silent
   * fallback would publish somebody else's theme under this installation's own
   * domain without anybody being able to tell.
   */
  theme: string;
  /**
   * What has been set on that theme, keyed by the feature it belongs to.
   *
   * Absent where nothing was set. The build writes each of these into the page
   * as the custom property its feature names, so nothing reads them at runtime.
   */
  themeSettings?: Record<string, string | number | boolean>;
  /** Card layout: one grouped card (default) or one card per service. */
  layout: VelvetLayout;
  /** Range pre-selected on first visit, before the visitor picks one themselves. */
  defaultRange: RangeKey;
  /** Per-service-ID Phosphor icon class overrides (merged over the defaults). */
  icons: Record<string, string>;
  /**
   * Optional SEO overrides. Each field overrides a value that is otherwise
   * auto-derived: `title` → `<name> — Status`, `description` → a line built from
   * `name`, `image` (og:image) → the auto-generated 1200×630 status card.
   * Consumed by the build-time SEO step.
   */
  seo?: { title?: string; description?: string; image?: string };
}

/**
 * What a configuration is filled up with where it says nothing.
 *
 * `theme` is absent because there is no default: a page is published in the
 * theme its configuration names, and a configuration naming none is refused by
 * the contract before it ever reaches here.
 */
const DEFAULTS: Omit<
  VelvetConfig,
  "owner" | "repo" | "dataBaseUrl" | "theme"
> = {
  dataBranch: "main",
  name: "Status",
  navbar: [{ title: "Status", href: "/" }],
  layout: "grouped",
  defaultRange: "month",
  logoHeight: 72,
  icons: {},
};

/**
 * Load and normalise the runtime config from `config.json`.
 *
 * @returns the merged config. Throws if `config.json` is missing `owner`/`repo`,
 *   since without them there is no data source to render.
 */
export async function loadConfig(
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<VelvetConfig> {
  const res = await fetchImplementation("config.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`config.json ${res.status}`);
  const raw = (await res.json()) as Partial<VelvetConfig> & {
    showSubscribe?: unknown;
  };
  Reflect.deleteProperty(raw, "showSubscribe");
  if (!raw.owner || !raw.repo) throw new Error("config.json must set owner and repo");
  if (!raw.theme) throw new Error("config.json must name the theme the page is published in");
  const dataBranch = raw.dataBranch ?? DEFAULTS.dataBranch;
  const dataBaseUrl =
    raw.dataBaseUrl?.replace(/\/+$/, "") ??
    `https://raw.githubusercontent.com/${encodeURIComponent(raw.owner)}/${encodeURIComponent(raw.repo)}/${encodeURIComponent(dataBranch)}/velvet-data/v1`;
  return {
    ...DEFAULTS,
    ...raw,
    owner: raw.owner,
    repo: raw.repo,
    theme: raw.theme,
    dataBranch,
    dataBaseUrl,
    icons: { ...DEFAULTS.icons, ...raw.icons },
    navbar: raw.navbar ?? DEFAULTS.navbar,
  };
}
