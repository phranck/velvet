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
  showPoweredBy: boolean;
  /** Navbar links. */
  navbar: Array<{ title: string; href: string }>;
  /** Card layout: one grouped card (default) or one card per service. */
  layout: VelvetLayout;
  /** Range pre-selected on first visit, before the visitor picks one themselves. */
  defaultRange: RangeKey;
  /** Semantic theme colours + optional font families. */
  theme: VelvetTheme;
  /** Per-service-ID Phosphor icon class overrides (merged over the defaults). */
  icons: Record<string, string>;
  /**
   * Umami web analytics. Both fields are required to load the tracker; the whole
   * block is omitted from `config.json` when not configured.
   * @property websiteId - the Umami site's `data-website-id`
   * @property src - full URL of the Umami tracking script (e.g. `https://analytics.example.com/script.js`)
   */
  umami?: { websiteId: string; src: string };
  /** Google Analytics 4 measurement ID (e.g. `G-XXXXXXXXXX`); absent when not configured. */
  googleAnalytics?: string;
  /**
   * Optional SEO overrides. Each field overrides a value that is otherwise
   * auto-derived: `title` → `<name> — Status`, `description` → a line built from
   * `name`, `image` (og:image) → the auto-generated 1200×630 status card.
   * Consumed by the build-time SEO step.
   */
  seo?: { title?: string; description?: string; image?: string };
}

const DEFAULTS: Omit<VelvetConfig, "owner" | "repo" | "dataBaseUrl"> = {
  dataBranch: "main",
  name: "Status",
  navbar: [{ title: "Status", href: "/" }],
  layout: "grouped",
  defaultRange: "month",
  logoHeight: 72,
  showPoweredBy: true,
  theme: resolveTheme(),
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
 * Apply theme colours and fonts as CSS custom properties on the document root
 * or an isolated preview surface.
 */
export function applyTheme(
  config: VelvetConfig,
  root: Pick<HTMLElement, "style"> = document.documentElement,
): void {
  for (const [name, value] of Object.entries(
    themeCssVariables(config.theme, `${config.owner}/${config.repo}`),
  )) {
    root.style.setProperty(name, value);
  }
  if (config.theme.fontSans) root.style.setProperty("--font-sans", config.theme.fontSans);
  if (config.theme.fontMono) root.style.setProperty("--font-mono", config.theme.fontMono);
  root.style.setProperty("--logo-height", `${config.logoHeight}px`);
  // Shared layout tokens (bar geometry, type scale, pill styling) — the very values
  // the OG card reads from `lib/tokens`, applied here as CSS custom properties so the
  // page and the social card render from one definition.
  for (const [name, value] of Object.entries(tokenCssVars())) {
    root.style.setProperty(name, value);
  }
}
