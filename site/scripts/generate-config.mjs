import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { load } from "js-yaml";

import { parseVelvetConfiguration } from "@velvet/contracts";

import { resolveTheme } from "../src/lib/theme.js";

/**
 * Generate Velvet's runtime `config.json` from native `velvet.yml` or an
 * explicitly selected legacy compatibility configuration.
 *
 * Native input is validated through `@velvet/contracts` and reads public data
 * from the dedicated `velvet-data` branch. Compatibility input keeps the legacy
 * appearance and data-location behavior unchanged.
 *
 * Usage: bun generate-config.mjs <config.yml> <out/config.json> [local-data-path]
 */
const [
  ,
  ,
  inputPath = "velvet.yml",
  outputPath = "public/config.json",
  repositoryDataPath = "velvet-data/v1",
] = process.argv;

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
const rc = load(source) ?? {};
const nativeResult = rc.schemaVersion === undefined
  ? null
  : parseVelvetConfiguration(source);
if (nativeResult !== null && !nativeResult.success) {
  throw new Error(
    `Invalid velvet.yml:\n${nativeResult.errors
      .map((error) => `${error.code} at ${error.path}: ${error.message}`)
      .join("\n")}`,
  );
}
const native = nativeResult?.success ? nativeResult.data : null;
const owner = native?.repository.owner ?? rc.owner;
const repo = native?.repository.name ?? rc.repo;
if (!owner || !repo) {
  throw new Error(
    nativeResult === null
      ? "Legacy compatibility configuration must set `owner` and `repo`"
      : "`velvet.yml` must set `repository.owner` and `repository.name`",
  );
}

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

const sw = native === null
  ? (rc["status-website"] ?? {})
  : {
      cname: native.statusPage.customDomain,
      name: native.statusPage.name,
      logoUrl: native.statusPage.logoUrl,
      navbar: native.statusPage.navigation,
    };
const velvet = native === null
  ? (sw.velvet ?? {})
  : {
      layout: native.statusPage.layout,
      defaultRange: native.statusPage.defaultRange,
      logoHeight: native.statusPage.logoHeight,
      showPoweredBy: native.statusPage.showPoweredBy,
      theme: nativeTheme(native.statusPage.theme),
      fontSans: native.statusPage.fonts?.sans,
      fontMono: native.statusPage.fonts?.mono,
      icons: native.statusPage.icons,
      seo: native.statusPage.seo,
    };
const themeInput = velvet.theme && typeof velvet.theme === "object" ? velvet.theme : {};
const dataBranch = native === null ? (velvet.dataBranch ?? "main") : "velvet-data";
const normalizedDataPath = repositoryDataPath.replaceAll("\\", "/").replace(/^\.\//, "");
const dataPathSegments = normalizedDataPath.split("/").filter(Boolean);
if (
  normalizedDataPath.startsWith("/") ||
  dataPathSegments.length === 0 ||
  dataPathSegments.includes("..")
) {
  throw new Error("Velvet data must use a repository-relative path");
}
const publicDataPath = native === null ? normalizedDataPath : "velvet-data/v1";
const encodedDataPath = publicDataPath
  .split("/")
  .map(encodeURIComponent)
  .join("/");
const defaultDataBaseUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(dataBranch)}/${encodedDataPath}`;
let dataBaseUrl = defaultDataBaseUrl;
if (typeof velvet.dataBaseUrl === "string" && velvet.dataBaseUrl.trim()) {
  const publicDataUrl = new URL(velvet.dataBaseUrl.trim());
  if (
    !["http:", "https:"].includes(publicDataUrl.protocol) ||
    publicDataUrl.search ||
    publicDataUrl.hash
  ) {
    throw new Error("Velvet dataBaseUrl must be an HTTP(S) base URL without query or fragment");
  }
  dataBaseUrl = publicDataUrl.href.replace(/\/+$/, "");
}

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
