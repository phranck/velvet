import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { parseVelvetConfiguration } from "@velvet/contracts";

import { resolveTheme } from "../src/lib/theme.js";

/**
 * Generates Velvet's runtime `config.json` from `velvet.yml`.
 *
 * The input is validated through `@velvet/contracts` before anything is
 * written, and the page reads its public data from the `velvet-data` branch the
 * monitor owns. A file that does not validate stops the build rather than
 * producing a page from a configuration nobody checked.
 *
 * This used to accept a second, foreign format as well, and carried a branch at
 * every field to translate it. Velvet reads one format.
 *
 * Usage: bun generate-config.mjs <velvet.yml> <out/config.json>
 */
const [, , inputPath = "velvet.yml", outputPath = "public/config.json"] =
  process.argv;

/**
 * The installation's running number, read from the lock beside the
 * configuration.
 *
 * Absent for anything installed before serials existed, and for anyone who
 * assembled a repository by hand, so a missing file or field is ordinary rather
 * than a fault. The page then shows no number instead of claiming one.
 */
function readSerial(configurationPath) {
  try {
    const lock = JSON.parse(
      readFileSync(join(dirname(configurationPath), "velvet.lock.json"), "utf8"),
    );
    return Number.isSafeInteger(lock.serial) && lock.serial > 0 ? lock.serial : null;
  } catch {
    return null;
  }
}

const serial = readSerial(inputPath);
const source = readFileSync(inputPath, "utf8");
const parsed = parseVelvetConfiguration(source);
if (!parsed.success) {
  throw new Error(
    `Invalid velvet.yml:\n${parsed.errors
      .map((error) => `${error.code} at ${error.path}: ${error.message}`)
      .join("\n")}`,
  );
}
const configuration = parsed.data;
const owner = configuration.repository.owner;
const repo = configuration.repository.name;

const nativeTheme = (theme) => {
  if (!theme) return {};
  const { chart, ...rest } = theme;
  return {
    ...rest,
    ...(chart
      ? {
          protocol: { ipv4: chart.line },
          chart: {
            ipv4LineStyle: chart.lineStyle,
            fill: chart.fill,
            background: chart.background,
            backgroundOpacity: chart.backgroundOpacity,
          },
        }
      : {}),
  };
};

const sw = {
  cname: configuration.statusPage.customDomain,
  name: configuration.statusPage.name,
  logoUrl: configuration.statusPage.logoUrl,
  navbar: configuration.statusPage.navigation,
};
const velvet = {
  layout: configuration.statusPage.layout,
  defaultRange: configuration.statusPage.defaultRange,
  logoHeight: configuration.statusPage.logoHeight,
  showPoweredBy: configuration.statusPage.showPoweredBy,
  theme: nativeTheme(configuration.statusPage.theme),
  fontSans: configuration.statusPage.fonts?.sans,
  fontMono: configuration.statusPage.fonts?.mono,
  icons: configuration.statusPage.icons,
  seo: configuration.statusPage.seo,
};
const themeInput = velvet.theme && typeof velvet.theme === "object" ? velvet.theme : {};
/**
 * Where a published page reads its data from.
 *
 * The branch and the path inside it are fixed, because the monitor owns that
 * branch and writes nowhere else. They were configurable for the sake of the
 * foreign format, which allowed data anywhere, and every value but this one
 * described a repository Velvet does not produce.
 */
const dataBranch = "velvet-data";
const dataPath = "velvet-data/v1";
const dataBaseUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(dataBranch)}/${dataPath
  .split("/")
  .map(encodeURIComponent)
  .join("/")}`;

const subst = (s) =>
  typeof s === "string" ? s.replaceAll("$OWNER", owner).replaceAll("$REPO", repo) : s;

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
  const normalizedOwner = String(owner).toLowerCase();
  return String(repo).toLowerCase() === `${normalizedOwner}.github.io`
    ? `https://${normalizedOwner}.github.io/`
    : `https://${normalizedOwner}.github.io/${repo}/`;
})();

// SEO overrides (all optional). Only the fields the consumer set are emitted; the
// rest fall back to auto-derived values in generate-seo.ts.
const seo = {};
for (const key of ["title", "description", "image"]) {
  const value = velvet.seo?.[key];
  if (typeof value === "string" && value.trim()) seo[key] = value.trim();
}

const config = {
  owner,
  repo,
  url: siteUrl,
  dataBranch,
  dataBaseUrl,
  name: sw.name ?? repo,
  logoUrl: sw.logoUrl,
  navbar: Array.isArray(sw.navbar)
    ? sw.navbar.map((n) => ({ title: n.title, href: subst(n.href) }))
    : [{ title: "Status", href: "/" }],
  layout: velvet.layout === "cards" ? "cards" : "grouped",
  defaultRange: normalizeRange(velvet.defaultRange),
  logoHeight: typeof velvet.logoHeight === "number" ? velvet.logoHeight : 72,
  showPoweredBy: velvet.showPoweredBy !== false,
  theme: {
    ...resolveTheme({
      ...themeInput,
      accent: themeInput.accent ?? velvet.accent,
      accentDeg: velvet.accentDeg,
      accentDown: velvet.accentDown,
    }),
    ...(velvet.fontSans ? { fontSans: velvet.fontSans } : {}),
    ...(velvet.fontMono ? { fontMono: velvet.fontMono } : {}),
  },
  icons: velvet.icons ?? {},
  ...(Object.keys(seo).length ? { seo } : {}),
  ...(serial === null ? {} : { serial }),
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
