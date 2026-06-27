/**
 * Demo monitoring data for the README screenshot.
 *
 * In Upptime the `.upptimerc.yml` config and the monitoring DATA are separate: the
 * config lists services, while `history/summary.json` and the incident issues are
 * produced by monitoring over time. The config side of the demo lives in
 * `demo/.upptimerc.yml` (run through the real generate-config + build); this file
 * supplies the matching fake data the rendered page fetches at runtime.
 *
 * A fictional "Velvet Underground Inc." with a realistic mix — mostly operational,
 * one degraded service ("Auth"), and one open incident — so the screenshot shows
 * the cards layout, IPv4/IPv6 pills, every status colour, and the incident banner.
 *
 * Everything is pinned to {@link FIXED_NOW}; `scripts/screenshot.mjs` freezes the
 * browser clock to the same instant so the screenshot is byte-stable across runs.
 * Slugs match the services in `demo/.upptimerc.yml`.
 */

/** The instant the demo renders "as of". The screenshot script freezes the page clock here. */
export const FIXED_NOW = "2026-06-01T12:00:00Z";

/** Owner/repo from `demo/.upptimerc.yml`; the rendered page fetches data under these, so the mocks key off them. */
export const DEMO_OWNER = "velvet-underground";
export const DEMO_REPO = "status";

const DAY_MS = 86_400_000;

/**
 * An ISO date (YYYY-MM-DD) `n` days before {@link FIXED_NOW}.
 * @param {number} n - how many days back
 * @returns {string} the date string
 */
function daysAgo(n) {
  return new Date(new Date(FIXED_NOW).getTime() - n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Build a `dailyMinutesDown` map from a sparse list of outages.
 * @param {Array<{ daysAgo: number, minutes: number }>} outages - downtime points
 * @returns {Record<string, number>} date → minutes-down (only non-zero days)
 */
function dailyDown(outages) {
  /** @type {Record<string, number>} */
  const map = {};
  for (const o of outages) map[daysAgo(o.daysAgo)] = o.minutes;
  return map;
}

/**
 * One Upptime `summary.json` service entry.
 * @param {object} o - service fields (`name`, `slug`, `url`, optional `status`, `uptime*`, `time`, `dailyMinutesDown`)
 * @returns {object} the summary entry
 */
function service(o) {
  return {
    name: o.name,
    url: o.url,
    icon: "",
    slug: o.slug,
    status: o.status ?? "up",
    uptime: o.uptime ?? "100.00%",
    uptimeDay: o.uptimeDay ?? o.uptime ?? "100.00%",
    uptimeWeek: o.uptimeWeek ?? o.uptime ?? "100.00%",
    uptimeMonth: o.uptimeMonth ?? o.uptime ?? "100.00%",
    uptimeYear: o.uptimeYear ?? o.uptime ?? "100.00%",
    time: o.time ?? 120,
    timeDay: o.time ?? 120,
    timeWeek: o.time ?? 120,
    timeMonth: o.time ?? 120,
    timeYear: o.time ?? 120,
    dailyMinutesDown: o.dailyMinutesDown ?? {},
  };
}

/**
 * The demo `summary.json`. Four services expose an IPv6 counterpart (folded into
 * one card with pills); "Auth" is currently degraded with recent amber days and
 * "API" carries one past blip — so bars, percentages, and the hero banner all show
 * more than a flat green wall.
 */
export const demoSummary = [
  service({ name: "Website", slug: "website", url: "https://velvet-underground.example", time: 88 }),
  service({ name: "Website IPv6", slug: "website-ipv6", url: "https://velvet-underground.example", time: 91 }),
  service({
    name: "API",
    slug: "api",
    url: "https://api.velvet-underground.example/health",
    time: 142,
    uptime: "99.98%",
    uptimeMonth: "99.98%",
    dailyMinutesDown: dailyDown([{ daysAgo: 19, minutes: 18 }]),
  }),
  service({
    name: "API IPv6",
    slug: "api-ipv6",
    url: "https://api.velvet-underground.example/health",
    time: 150,
    uptime: "99.98%",
    uptimeMonth: "99.98%",
    dailyMinutesDown: dailyDown([{ daysAgo: 19, minutes: 18 }]),
  }),
  service({
    name: "Database",
    slug: "database",
    url: "https://api.velvet-underground.example/health/db",
    time: 34,
  }),
  service({ name: "CDN", slug: "cdn", url: "https://cdn.velvet-underground.example", time: 22 }),
  service({ name: "CDN IPv6", slug: "cdn-ipv6", url: "https://cdn.velvet-underground.example", time: 25 }),
  service({
    name: "Auth",
    slug: "auth",
    url: "https://auth.velvet-underground.example/health",
    status: "degraded",
    time: 612,
    uptime: "99.71%",
    uptimeDay: "97.40%",
    uptimeWeek: "99.40%",
    uptimeMonth: "99.71%",
    dailyMinutesDown: dailyDown([
      { daysAgo: 0, minutes: 86 },
      { daysAgo: 1, minutes: 64 },
      { daysAgo: 6, minutes: 41 },
    ]),
  }),
  service({
    name: "Auth IPv6",
    slug: "auth-ipv6",
    url: "https://auth.velvet-underground.example/health",
    time: 280,
  }),
  service({
    name: "Mail",
    slug: "mail",
    url: "https://api.velvet-underground.example/health/mail",
    time: 198,
    uptime: "99.95%",
    uptimeMonth: "99.95%",
  }),
];

/** The mocked GitHub issues payload — one open incident tied to the degraded Auth service. */
export const demoIssues = [
  {
    number: 128,
    title: "Elevated login latency in eu-west — investigating",
    html_url: `https://github.com/${DEMO_OWNER}/${DEMO_REPO}/issues/128`,
    created_at: new Date(new Date(FIXED_NOW).getTime() - 3 * 3600 * 1000).toISOString(),
    labels: [],
  },
];

/** The mocked repo metadata — `created_at` sits well before the 1-year window so no ghost bars show. */
export const demoRepo = { created_at: "2025-01-01T00:00:00Z" };
