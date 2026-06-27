import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { load } from "js-yaml";

/**
 * Generate Velvet's runtime `config.json` from a consumer's Upptime `.upptimerc.yml`.
 *
 * Velvet-specific options live under `status-website.velvet` so the file stays a
 * valid Upptime config. Everything else (owner, repo, name, logo, navbar) is read
 * from the standard Upptime fields.
 *
 * Usage: node generate-config.mjs <.upptimerc.yml> <out/config.json>
 */
const [, , inputPath = ".upptimerc.yml", outputPath = "public/config.json"] = process.argv;

const rc = load(readFileSync(inputPath, "utf8")) ?? {};
if (!rc.owner || !rc.repo) {
  throw new Error("`.upptimerc.yml` must set `owner` and `repo`");
}

const sw = rc["status-website"] ?? {};
const velvet = sw.velvet ?? {};

const subst = (s) =>
  typeof s === "string" ? s.replaceAll("$OWNER", rc.owner).replaceAll("$REPO", rc.repo) : s;

// Accept either the internal range key (`quarter`) or the user-facing label
// (`90d`) for `velvet.defaultRange`; fall back to the 30d view on anything else.
const RANGE_KEYS = ["day", "week", "month", "quarter", "year"];
const RANGE_LABEL_TO_KEY = { "24h": "day", "7d": "week", "30d": "month", "90d": "quarter", "1yr": "year" };
const normalizeRange = (value) => {
  if (typeof value !== "string") return "month";
  const v = value.trim().toLowerCase();
  if (RANGE_KEYS.includes(v)) return v;
  return RANGE_LABEL_TO_KEY[v] ?? "month";
};

// Canonical public URL of the status page: the custom domain when set, otherwise
// the GitHub Pages URL (an org/user page when the repo is `<owner>.github.io`,
// else a project page). Powers the SEO canonical/og:url tags and the sitemap.
const siteUrl = (() => {
  if (sw.cname) return `https://${sw.cname}/`;
  const owner = String(rc.owner).toLowerCase();
  return String(rc.repo).toLowerCase() === `${owner}.github.io`
    ? `https://${owner}.github.io/`
    : `https://${owner}.github.io/${rc.repo}/`;
})();

// SEO overrides (all optional). Only the fields the consumer set are emitted; the
// rest fall back to auto-derived values in generate-seo.mjs.
const seo = {};
for (const key of ["title", "description", "image"]) {
  const value = velvet.seo?.[key];
  if (typeof value === "string" && value.trim()) seo[key] = value.trim();
}

const config = {
  owner: rc.owner,
  repo: rc.repo,
  url: siteUrl,
  dataBranch: velvet.dataBranch ?? "main",
  name: sw.name ?? rc.repo,
  logoUrl: sw.logoUrl,
  navbar: Array.isArray(sw.navbar)
    ? sw.navbar.map((n) => ({ title: n.title, href: subst(n.href) }))
    : [{ title: "Status", href: "/" }],
  layout: velvet.layout === "cards" ? "cards" : "grouped",
  defaultRange: normalizeRange(velvet.defaultRange),
  logoHeight: typeof velvet.logoHeight === "number" ? velvet.logoHeight : 72,
  showPoweredBy: velvet.showPoweredBy !== false,
  showSubscribe: velvet.showSubscribe !== false,
  theme: {
    accent: velvet.accent ?? "#6366f1",
    accentDeg: velvet.accentDeg ?? "#d29922",
    accentDown: velvet.accentDown ?? "#f85149",
    ...(velvet.fontSans ? { fontSans: velvet.fontSans } : {}),
    ...(velvet.fontMono ? { fontMono: velvet.fontMono } : {}),
  },
  icons: velvet.icons ?? {},
  // Analytics: emit each block only when fully configured, so the app injects the
  // tracker only when the consumer asked for it. Umami needs both id + script URL.
  ...(velvet.umami && velvet.umami.websiteId && velvet.umami.src
    ? { umami: { websiteId: String(velvet.umami.websiteId), src: String(velvet.umami.src) } }
    : {}),
  ...(typeof velvet.googleAnalytics === "string" && velvet.googleAnalytics.trim()
    ? { googleAnalytics: velvet.googleAnalytics.trim() }
    : {}),
  ...(Object.keys(seo).length ? { seo } : {}),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);

// Preserve a custom domain across deploys: emit a CNAME next to config.json so
// the build output carries it (otherwise a clean gh-pages deploy drops it).
if (sw.cname) {
  writeFileSync(join(dirname(outputPath), "CNAME"), `${sw.cname}\n`);
  console.log(`velvet: wrote CNAME for ${sw.cname}`);
}
console.log(`velvet: wrote ${outputPath} for ${config.owner}/${config.repo}`);
