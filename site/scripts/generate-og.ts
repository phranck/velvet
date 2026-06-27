import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import {
  barsForRange,
  fetchMonitoringStart,
  groupByProtocol,
  overallStatus,
  RANGE_LABEL,
  STATUS_HERO,
  uptimeForRange,
} from "../src/lib/data";
import { iconFor } from "../src/lib/icons";
import { OG_SCALE, bar, pill, segGloss, typeScale } from "../src/lib/tokens";
import type { DayStatus, RangeKey, ServiceSummary } from "../src/lib/types";

/**
 * Generate the 1200×630 social card (og:image / twitter:image) for a status page.
 *
 * The card mirrors the live page: centred brand (logo when set), the overall-status
 * hero, and a faithful first-service card — icon, name, IPv4/IPv6 pills, uptime %,
 * the uptime bar and its range labels. Crucially it does NOT re-implement any of
 * that: the bar series, status roll-up, uptime figure and protocol folding come from
 * `src/lib/data`, and every size/colour from `src/lib/tokens` (the same module that
 * drives the live CSS), scaled by {@link OG_SCALE}. A layout change to the page thus
 * updates this card automatically — there is no duplicated geometry to drift.
 *
 * Built as SVG and rasterised with resvg (no browser), light enough to run in the
 * Velvet Action on every deploy. Run via `tsx` so it can import the TypeScript modules.
 *
 * Usage: tsx generate-og.ts <config.json> <summary.json> <out.png>
 */
const [, , configPath = "public/config.json", summaryPath = "", outPath = "dist/og.png"] =
  process.argv;
const config = JSON.parse(readFileSync(configPath, "utf8"));

/** Monitored services (IPv6 siblings folded in), or [] before the first summary exists. */
let services: ServiceSummary[] = [];
try {
  services = groupByProtocol(JSON.parse(readFileSync(summaryPath, "utf8")) as ServiceSummary[]);
} catch {
  // No summary.json yet (very first deploy) — render without the service card.
}

const name = config.name ?? config.repo ?? "Status";
const theme = config.theme ?? {};
const accent = theme.accent ?? "#6366f1";
const accentDeg = theme.accentDeg ?? "#d29922";
const accentDown = theme.accentDown ?? "#f85149";
/** Colour for a status, matching the page's up / degraded / down palette. */
const colourFor = (status: string): string =>
  status === "down" ? accentDown : status === "degraded" ? accentDeg : accent;

// The card renders the range a first-time visitor sees first (config.defaultRange),
// so the bar count + labels match the live default view exactly.
const range = (config.defaultRange ?? "quarter") as RangeKey;
const today = new Date().toISOString().slice(0, 10);

const overall = overallStatus(services);
const hero = STATUS_HERO[overall];

// First service + its folded IPv6 counterpart, straight from the grouped list.
const first = services[0] ?? null;
const ipv6 = first?.ipv6 ?? null;
const firstIcon = first ? iconFor(first.slug, config.icons ?? {}) : "ph-circle";
// Days before monitoring began render as ghost bars — fetch the repo's creation date
// so the card's bar series + uptime match the live view exactly. (fetchMonitoringStart
// touches localStorage, which is absent in Node; its try/catch falls through to the
// network lookup. Best-effort: a failure yields null, i.e. no ghost bars.)
const monitoringStart = first
  ? await fetchMonitoringStart(config.owner, config.repo, process.env.GITHUB_TOKEN)
  : null;
const days: DayStatus[] = first ? barsForRange(first, range, today, monitoringStart) : [];
const uptime = first ? uptimeForRange(first, range, today, monitoringStart) : "";

const esc = (s: string): string =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const host = String(config.url ?? "")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");
const FONT = "Inter, DejaVu Sans, Helvetica, Arial, sans-serif";

const ICON_DIR = new URL("../node_modules/@phosphor-icons/core/assets/duotone/", import.meta.url);
/** Inline a Phosphor duotone icon, placed + scaled + tinted. */
function icon(phClass: string, x: number, y: number, size: number, colour: string): string {
  let inner = "";
  try {
    const n = String(phClass).replace(/^ph-/, "");
    inner = readFileSync(new URL(`${n}-duotone.svg`, ICON_DIR), "utf8")
      .replace(/<svg[^>]*>/, "")
      .replace(/<\/svg>\s*$/, "");
  } catch {
    inner = "";
  }
  return `<g transform="translate(${x},${y}) scale(${(size / 256).toFixed(4)})" fill="${colour}">${inner}</g>`;
}

// ── Sizes derived once from the shared tokens × the card's scale factor ──────────
const headlineSize = typeScale.headline * OG_SCALE;
const heroIconSize = typeScale.heroIcon * OG_SCALE;
const nameSize = typeScale.serviceName * OG_SCALE;
const uptimeSize = typeScale.uptime * OG_SCALE;
const svcIconSize = typeScale.serviceIcon * OG_SCALE;
const protoSize = typeScale.proto * OG_SCALE;
const labelsSize = typeScale.labels * OG_SCALE;
const barH = bar.height * OG_SCALE;
const barGap = bar.gap * OG_SCALE;
const dotD = pill.dot * OG_SCALE;

// IPv4/IPv6 pill geometry, scaled from the live proto badge. Both labels are four
// characters, so one width fits either; positioned right-to-left before the uptime %.
const PILL_H = Math.round(protoSize) + 11;
const PILL_PAD_L = 11;
const PILL_GAP_DOT = 7;
const PILL_PAD_R = 13;
const PILL_TEXT_X = PILL_PAD_L + dotD + PILL_GAP_DOT;
const PILL_W = Math.round(PILL_TEXT_X + 4 * protoSize * 0.64 + PILL_PAD_R);

/** An "IPv4"/"IPv6" pill with a status dot, scaled from the live ServiceRow badge. */
function pillEl(x: number, y: number, label: string, dotColour: string): string {
  return `<g transform="translate(${x.toFixed(1)},${y})">
    <rect width="${PILL_W}" height="${PILL_H}" rx="${PILL_H / 2}" fill="#ffffff" fill-opacity="${pill.bgOpacity}" stroke="#ffffff" stroke-opacity="${pill.borderOpacity}"/>
    <circle cx="${(PILL_PAD_L + dotD / 2).toFixed(1)}" cy="${PILL_H / 2}" r="${(dotD / 2).toFixed(1)}" fill="${dotColour}"/>
    <text x="${PILL_TEXT_X.toFixed(1)}" y="${(PILL_H / 2 + protoSize * 0.34).toFixed(1)}" font-family="${FONT}" font-size="${protoSize.toFixed(1)}" font-weight="600" fill="#aab2bd">${label}</text>
  </g>`;
}

/**
 * The uptime bar: one segment per {@link DayStatus} from {@link barsForRange}, each a
 * status-coloured rounded rect with the shared gloss overlay laid on top. Segments are
 * fully rounded for the 90-day ("quarter") view, matching the live `.bar.rounded`.
 */
function uptimeBars(series: DayStatus[], x0: number, y0: number, totalW: number): string {
  const n = series.length;
  if (n === 0) return "";
  const bw = (totalW - (n - 1) * barGap) / n;
  const rounded = range === "quarter";
  const rx = (rounded ? Math.min(bw, barH) / 2 : bar.radius * OG_SCALE).toFixed(1);
  let out = "";
  for (let i = 0; i < n; i++) {
    const d = series[i];
    const x = (x0 + i * (bw + barGap)).toFixed(2);
    const w = bw.toFixed(2);
    if (!d.hasData) {
      out += `<rect x="${x}" y="${y0}" width="${w}" height="${barH}" rx="${rx}" fill="#ffffff" fill-opacity="0.05"/>`;
      continue;
    }
    out += `<rect x="${x}" y="${y0}" width="${w}" height="${barH}" rx="${rx}" fill="${colourFor(d.status)}"/>`;
    out += `<rect x="${x}" y="${y0}" width="${w}" height="${barH}" rx="${rx}" fill="url(#segGloss)"/>`;
  }
  return out;
}

const W = 1200;
const H = 630;
const M = 72; // horizontal margin / padding (matches the page; used by the footer too)
const cardX = M;
const cardY = 300;
const cardW = W - 2 * M;
const cardH = 210;
const pad = 40;
const inL = cardX + pad; // 112
const inR = cardX + cardW - pad; // 1088
const logoH = typeof config.logoHeight === "number" ? config.logoHeight : 72;

// Pills sit right-to-left ahead of the uptime %, with a clear gap reserved for it.
const UPTIME_CLEARANCE = 120;
const PILL_GAP = 10;
const pillV6X = inR - UPTIME_CLEARANCE - PILL_W;
const pillV4X = pillV6X - PILL_GAP - PILL_W;

// Brand: render the actual logo when `logoUrl` is set (fetched + embedded at its
// configured height), else the uppercased name as text. Any fetch problem falls back.
let brand = `<text x="${W / 2}" y="92" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="600" letter-spacing="1.5" fill="#9aa3af">${esc(name).toUpperCase()}</text>`;
if (config.logoUrl) {
  try {
    const res = await fetch(config.logoUrl);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? "";
      const head = buf.subarray(0, 256).toString("utf8");
      const isSvg =
        contentType.includes("svg") || /\.svg(\?|$)/i.test(config.logoUrl) || /<svg[\s>]/i.test(head);
      // Embed the whole logo as a self-contained data-URI image so its namespaces,
      // defs and prolog stay intact (resvg renders it as a nested sub-document).
      const mime = isSvg ? "image/svg+xml" : contentType.split(";")[0] || "image/png";
      const boxW = 760;
      const boxH = logoH;
      const boxX = (W - boxW) / 2;
      const boxY = 42;
      brand = `<image x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" preserveAspectRatio="xMidYMid meet" href="data:${mime};base64,${buf.toString("base64")}"/>`;
    }
  } catch {
    // keep the text fallback
  }
}

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="-12%" r="78%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.18"/>
      <stop offset="60%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02"/>
    </linearGradient>
    <linearGradient id="segGloss" x1="0" y1="0" x2="0" y2="1">${segGloss
      .map(
        (s) =>
          `<stop offset="${(s.offset * 100).toFixed(0)}%" stop-color="rgb(${s.rgb})" stop-opacity="${s.opacity}"/>`,
      )
      .join("")}</linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0b0d12"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${brand}

  ${icon(hero.icon, W / 2 - heroIconSize / 2, 124, heroIconSize, colourFor(overall))}
  <text x="${W / 2}" y="255" text-anchor="middle" font-family="${FONT}" font-size="${headlineSize.toFixed(1)}" font-weight="700" fill="#eef0f3">${esc(hero.text)}</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="url(#card)" stroke="#ffffff" stroke-opacity="0.08"/>
  ${
    first
      ? `${icon(firstIcon, inL, cardY + 28, svcIconSize, colourFor(first.status))}
  <text x="${inL + svcIconSize + 14}" y="${cardY + 52}" font-family="${FONT}" font-size="${nameSize.toFixed(1)}" font-weight="600" fill="#e3e6ea">${esc(first.name)}</text>
  <text x="${inR}" y="${cardY + 52}" text-anchor="end" font-family="${FONT}" font-size="${uptimeSize.toFixed(1)}" font-weight="700" fill="${colourFor(first.status)}">${esc(uptime)}</text>
  ${ipv6 ? pillEl(pillV4X, cardY + 31, "IPv4", colourFor(first.status)) + pillEl(pillV6X, cardY + 31, "IPv6", colourFor(ipv6.status)) : ""}
  ${uptimeBars(days, inL, cardY + 88, cardW - 2 * pad)}
  <text x="${inL}" y="${cardY + 168}" font-family="${FONT}" font-size="${labelsSize.toFixed(1)}" fill="#6b7280">${esc(RANGE_LABEL[range])}</text>
  <text x="${inR}" y="${cardY + 168}" text-anchor="end" font-family="${FONT}" font-size="${labelsSize.toFixed(1)}" fill="#6b7280">Today</text>`
      : ""
  }

  <text x="${M}" y="580" font-family="${FONT}" font-size="22" fill="#5b636e">${esc(host)}</text>
  <text x="${W - M}" y="580" text-anchor="end" font-family="${FONT}" font-size="22" font-weight="600" fill="#6b7280">Velvet</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  background: "#0b0d12",
  font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" },
});
const png = resvg.render().asPng();
writeFileSync(outPath, png);
console.log(`velvet: wrote ${outPath} (${(png.length / 1024).toFixed(0)} KB, status: ${overall})`);
