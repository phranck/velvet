/**
 * Velvet runtime configuration.
 *
 * The deployed bundle is generic: it loads `config.json` (served next to the
 * bundle, generated from a consumer's `.upptimerc.yml` by the Velvet Action) and
 * themes itself + points its data fetches at the consumer's monitoring repo.
 * Nothing about a specific project is baked into the build.
 */

/**
 * Card layout for the service list.
 * - `grouped`: all services share one card (the default).
 * - `cards`: every service gets its own card.
 */
export type VelvetLayout = "grouped" | "cards";

export interface VelvetConfig {
  /** GitHub owner of the Upptime monitoring repo to read data + issues from. */
  owner: string;
  /** Repository name of the Upptime monitoring repo. */
  repo: string;
  /** Branch the monitoring data (`history/summary.json`) lives on. */
  dataBranch: string;
  /** Brand name shown in the navbar. */
  name: string;
  /** Optional logo URL shown in the navbar. */
  logoUrl?: string;
  /** Logo height in pixels (width scales proportionally). */
  logoHeight: number;
  /** Navbar links. */
  navbar: Array<{ title: string; href: string }>;
  /** Card layout: one grouped card (default) or one card per service. */
  layout: VelvetLayout;
  /** Theme colours + optional font families. */
  theme: {
    accent: string;
    accentDeg: string;
    accentDown: string;
    fontSans?: string;
    fontMono?: string;
  };
  /** Per-service-slug Phosphor icon class overrides (merged over the defaults). */
  icons: Record<string, string>;
}

const DEFAULTS: Omit<VelvetConfig, "owner" | "repo"> = {
  dataBranch: "main",
  name: "Status",
  navbar: [{ title: "Status", href: "/" }],
  layout: "grouped",
  logoHeight: 44,
  theme: {
    accent: "#6366f1",
    accentDeg: "#d29922",
    accentDown: "#f85149",
  },
  icons: {},
};

/**
 * Load and normalise the runtime config from `config.json`.
 *
 * @returns the merged config. Throws if `config.json` is missing `owner`/`repo`,
 *   since without them there is no data source to render.
 */
export async function loadConfig(): Promise<VelvetConfig> {
  const res = await fetch("config.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`config.json ${res.status}`);
  const raw = (await res.json()) as Partial<VelvetConfig>;
  if (!raw.owner || !raw.repo) throw new Error("config.json must set owner and repo");
  return {
    ...DEFAULTS,
    ...raw,
    owner: raw.owner,
    repo: raw.repo,
    theme: { ...DEFAULTS.theme, ...raw.theme },
    icons: { ...DEFAULTS.icons, ...raw.icons },
    navbar: raw.navbar ?? DEFAULTS.navbar,
  };
}

/**
 * Apply theme colours and fonts as CSS custom properties on the document root.
 * Called once before first render so the page paints in the consumer's brand.
 */
export function applyTheme(config: VelvetConfig): void {
  const root = document.documentElement;
  root.style.setProperty("--accent", config.theme.accent);
  root.style.setProperty("--accent-deg", config.theme.accentDeg);
  root.style.setProperty("--accent-down", config.theme.accentDown);
  if (config.theme.fontSans) root.style.setProperty("--font-sans", config.theme.fontSans);
  if (config.theme.fontMono) root.style.setProperty("--font-mono", config.theme.fontMono);
  root.style.setProperty("--logo-height", `${config.logoHeight}px`);
}
