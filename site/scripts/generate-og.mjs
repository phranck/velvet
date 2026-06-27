import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

/**
 * Generate the 1200×630 social card (og:image / twitter:image) for a status page.
 *
 * Rather than the brand logo, the card mirrors the page: centred brand name, the
 * overall-status hero (Phosphor icon + headline in the theme colour), and a faithful
 * first-service card — service icon, name, IPv4/IPv6 pills, uptime %, the uptime bar,
 * and the "90 days ago / Today" labels. Built as SVG and rasterised with resvg (no
 * browser), so it stays light enough to run in the Velvet Action on every deploy.
 *
 * Usage: node generate-og.mjs <config.json> <summary.json> <out.png>
 */
const [, , configPath = "public/config.json", summaryPath = "", outPath = "dist/og.png"] = process.argv;
const config = JSON.parse(readFileSync(configPath, "utf8"));

/** Monitored services, or [] before the first monitoring run has produced a summary. */
let services = [];
try {
  services = JSON.parse(readFileSync(summaryPath, "utf8"));
} catch {
  // No summary.json yet (very first deploy) — render without the service card.
}

const name = config.name ?? config.repo ?? "Status";
const theme = config.theme ?? {};
const accent = theme.accent ?? "#6366f1";
const accentDeg = theme.accentDeg ?? "#d29922";
const accentDown = theme.accentDown ?? "#f85149";
/** Colour for a status, matching the page's up / degraded / down palette. */
const colourFor = (status) =>
  status === "down" ? accentDown : status === "degraded" ? accentDeg : accent;

const overall = services.some((s) => s.status === "down")
  ? "down"
  : services.some((s) => s.status === "degraded")
    ? "degraded"
    : "up";
const headline =
  overall === "down"
    ? "Some systems down"
    : overall === "degraded"
      ? "Some systems degraded"
      : "All systems operational";
const heroIcon = overall === "down" ? "warning-octagon" : overall === "degraded" ? "warning" : "check-circle";

// First "real" service (skip folded IPv6 siblings) + its IPv6 counterpart, if any.
const first = services.find((s) => !String(s.slug ?? "").endsWith("-ipv6")) ?? services[0] ?? null;
const ipv6 = first ? services.find((s) => s.slug === `${first.slug}-ipv6`) : null;
const DEFAULT_ICONS = {
  frontend: "ph-globe",
  api: "ph-brackets-curly",
  backend: "ph-gear-six",
  dashboard: "ph-gauge",
  database: "ph-database",
  email: "ph-envelope-simple",
  "developer-site": "ph-code",
};
const firstIcon = first ? ((config.icons ?? {})[first.slug] ?? DEFAULT_ICONS[first.slug] ?? "ph-circle") : "ph-circle";

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const host = String(config.url ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const FONT = "Inter, DejaVu Sans, Helvetica, Arial, sans-serif";

const ICON_DIR = new URL("../node_modules/@phosphor-icons/core/assets/duotone/", import.meta.url);
/** Inline a Phosphor duotone icon, placed + scaled + tinted. */
function icon(phClass, x, y, size, colour) {
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

/** An "IPv4"/"IPv6" pill with a status dot, matching the card header. */
function pill(x, y, label, dotColour) {
  return `<g transform="translate(${x},${y})">
    <rect width="84" height="36" rx="18" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.10"/>
    <circle cx="21" cy="18" r="5" fill="${dotColour}"/>
    <text x="37" y="24" font-family="${FONT}" font-size="18" font-weight="600" fill="#aab2bd">${label}</text>
  </g>`;
}

/** The uptime bar: one bar per trailing day, coloured by that day's downtime. */
function uptimeBars(service, x0, y0, totalW, h, n = 72) {
  const gap = 3;
  const bw = (totalW - (n - 1) * gap) / n;
  const daily = service?.dailyMinutesDown ?? {};
  const today = new Date();
  let out = "";
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - (n - 1 - i));
    const md = daily[d.toISOString().slice(0, 10)] ?? 0;
    const col = md <= 0 ? accent : md / 1440 >= 0.3 ? accentDown : accentDeg;
    out += `<rect x="${(x0 + i * (bw + gap)).toFixed(1)}" y="${y0}" width="${bw.toFixed(1)}" height="${h}" rx="2" fill="${col}"/>`;
  }
  return out;
}

const W = 1200;
const H = 630;
const M = 72; // horizontal margin / padding (matches the page; used by the footer too)
const cardX = M;
const cardY = 300;
const cardW = W - 2 * M;
const cardH = 218;
const pad = 40;
const inL = cardX + pad; // 112
const inR = cardX + cardW - pad; // 1088
const uptime = first ? esc(first.uptimeMonth ?? first.uptime ?? "") : "";

// Brand: render the actual logo when `logoUrl` is set (fetched + embedded), else the
// uppercased name as text. Any fetch problem falls back to the text.
let brand = `<text x="${W / 2}" y="84" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="600" letter-spacing="1.5" fill="#9aa3af">${esc(name).toUpperCase()}</text>`;
if (config.logoUrl) {
  try {
    const res = await fetch(config.logoUrl);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? "";
      const head = buf.subarray(0, 256).toString("utf8");
      const isSvg = contentType.includes("svg") || /\.svg(\?|$)/i.test(config.logoUrl) || /<svg[\s>]/i.test(head);
      // Embed the whole logo as a self-contained data-URI image so its namespaces,
      // defs and prolog stay intact (resvg renders it as a nested sub-document).
      const mime = isSvg ? "image/svg+xml" : contentType.split(";")[0] || "image/png";
      const boxW = 760;
      const boxH = 60;
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
  </defs>
  <rect width="${W}" height="${H}" fill="#0b0d12"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  ${brand}

  ${icon(heroIcon, W / 2 - 26, 124, 52, colourFor(overall))}
  <text x="${W / 2}" y="244" text-anchor="middle" font-family="${FONT}" font-size="50" font-weight="700" fill="#eef0f3">${esc(headline)}</text>

  <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="22" fill="url(#card)" stroke="#ffffff" stroke-opacity="0.08"/>
  ${
    first
      ? `${icon(firstIcon, inL, cardY + 28, 40, colourFor(first.status))}
  <text x="${inL + 58}" y="${cardY + 60}" font-family="${FONT}" font-size="36" font-weight="600" fill="#e3e6ea">${esc(first.name)}</text>
  <text x="${inR}" y="${cardY + 60}" text-anchor="end" font-family="${FONT}" font-size="36" font-weight="700" fill="${colourFor(first.status)}">${uptime}</text>
  ${ipv6 ? pill(inR - 430, cardY + 30, "IPv4", colourFor(first.status)) + pill(inR - 336, cardY + 30, "IPv6", colourFor(ipv6.status)) : ""}
  ${uptimeBars(first, inL, cardY + 100, cardW - 2 * pad, 46)}
  <text x="${inL}" y="${cardY + 188}" font-family="${FONT}" font-size="19" fill="#6b7280">90 days ago</text>
  <text x="${inR}" y="${cardY + 188}" text-anchor="end" font-family="${FONT}" font-size="19" fill="#6b7280">Today</text>`
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
