/**
 * Velvet runtime configuration.
 *
 * The deployed bundle is generic: it loads `config.json` (served next to the
 * bundle, generated for the consumer repository by the Velvet Action) and
 * themes itself while pointing data fetches at Velvet repository storage.
 * Nothing about a specific project is baked into the build.
 */

import { tokenCssVars } from "./tokens";
import type { FetchImplementation } from "./fetch.js";
import { resolveTheme, themeCssVariables } from "./theme.js";
import type { RangeKey } from "./types";

/**
 * Card layout for the service list.
 * - `grouped`: all services share one card (the default).
 * - `cards`: every service gets its own card.
 */
export type VelvetLayout = "grouped" | "cards";

export type VelvetTheme = ReturnType<typeof resolveTheme> & {
  fontSans?: string;
  fontMono?: string;
};

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
   * The design this installation publishes in, named by its bundle directory.
   *
   * Absent for an installation that names none, which publishes the page Velvet
   * ships. A name no installed design answers to stops the build, because a
   * silent fallback would publish somebody else's design under this
   * installation's own domain without anybody being able to tell.
   */
  design?: string;
  /** Card layout: one grouped card (default) or one card per service. */
  layout: VelvetLayout;
  /** Range pre-selected on first visit, before the visitor picks one themselves. */
  defaultRange: RangeKey;
  /** Semantic theme colours + optional font families. */
  theme: VelvetTheme;
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
 * `theme` is deliberately absent. The return below states it explicitly and so
 * overrides both this and the loaded document, which made the entry here a
 * value nothing ever read whilst reading as though it were the theme a silent
 * configuration gets. That theme comes from `resolveTheme(undefined)`, which is
 * the same call the return makes for a document naming no theme.
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
  const dataBranch = raw.dataBranch ?? DEFAULTS.dataBranch;
  const dataBaseUrl =
    raw.dataBaseUrl?.replace(/\/+$/, "") ??
    `https://raw.githubusercontent.com/${encodeURIComponent(raw.owner)}/${encodeURIComponent(raw.repo)}/${encodeURIComponent(dataBranch)}/velvet-data/v1`;
  const rawTheme = raw.theme as
    | (Partial<VelvetTheme> & {
        accentDeg?: string;
        accentDown?: string;
      })
    | undefined;
  return {
    ...DEFAULTS,
    ...raw,
    owner: raw.owner,
    repo: raw.repo,
    dataBranch,
    dataBaseUrl,
    theme: {
      ...resolveTheme(rawTheme),
      ...(rawTheme?.fontSans ? { fontSans: rawTheme.fontSans } : {}),
      ...(rawTheme?.fontMono ? { fontMono: rawTheme.fontMono } : {}),
    },
    icons: { ...DEFAULTS.icons, ...raw.icons },
    navbar: raw.navbar ?? DEFAULTS.navbar,
  };
}

/**
 * Every custom property a configuration contributes to the page.
 *
 * Stated once, because two things need them and at different times: the browser
 * sets them on the document root, whilst the build writes them into a stylesheet
 * so a prerendered page is themed before any script has run. A page that had to
 * wait for JavaScript to learn its own colours would arrive in the fallback
 * palette and repaint, which is most of what prerendering it was meant to avoid.
 *
 * @param config - The configuration the page is rendered from.
 * @returns Property names mapped to their values, ready to be set or written.
 */
export function themeCustomProperties(
  config: VelvetConfig,
): Record<string, string> {
  return {
    ...themeCssVariables(config.theme, `${config.owner}/${config.repo}`),
    ...(config.theme.fontSans ? { "--font-sans": config.theme.fontSans } : {}),
    ...(config.theme.fontMono ? { "--font-mono": config.theme.fontMono } : {}),
    "--logo-height": `${config.logoHeight}px`,
    // Shared layout tokens (bar geometry, type scale, pill styling) — the very
    // values the OG card reads from `lib/tokens`, so the page and the social
    // card render from one definition.
    ...tokenCssVars(),
  };
}

/**
 * Apply theme colours and fonts as CSS custom properties on the document root
 * or an isolated preview surface.
 */
export function applyTheme(
  config: VelvetConfig,
  root: Pick<HTMLElement, "style"> = document.documentElement,
): void {
  for (const [name, value] of Object.entries(themeCustomProperties(config))) {
    root.style.setProperty(name, value);
  }
}
