import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Inject per-deployment SEO into a built Velvet site so non-JS crawlers and social
 * scrapers (which never run the SPA) see correct metadata.
 *
 * Velvet renders client-side, so the static `index.html` only carries fallback
 * title/description. The Velvet Action runs this after `vite build`: it rewrites
 * the title + description and adds canonical + Open Graph + Twitter Card tags from
 * `config.json`, then writes `robots.txt` (allow-all + sitemap) and `sitemap.xml`.
 *
 * Usage: node generate-seo.mjs <config.json> <dist-dir>
 */
const [, , configPath = "public/config.json", distDir = "dist"] = process.argv;
const config = JSON.parse(readFileSync(configPath, "utf8"));

const name = config.name ?? config.repo ?? "Status";
const url = config.url ?? "/";

// `config.seo` holds optional overrides; title/description fall back to values
// auto-derived from the brand name.
const seo = config.seo ?? {};
const title = seo.title ?? `${name} — Status`;
const description = seo.description ?? `Live status and uptime history for ${name}.`;

// Social card: a `seo.image` override (resolved to absolute) wins; otherwise the
// auto-generated card from generate-og (dist/og.png), when present.
const cardImage = existsSync(join(distDir, "og.png")) ? `${url}og.png` : null;
const ogImage = seo.image
  ? /^https?:\/\//.test(seo.image)
    ? seo.image
    : new URL(String(seo.image).replace(/^\//, ""), url).href
  : cardImage;
// The generated card has known type + dimensions; advertising them helps iMessage,
// Slack, etc. render a large preview reliably (and SVG logos are never used).
const isCard = ogImage !== null && ogImage === cardImage;

/** Escape a value for use inside an HTML/XML double-quoted attribute. */
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const indexPath = join(distDir, "index.html");
let html = readFileSync(indexPath, "utf8");

// Replace the fallback title + description with the per-deployment values.
html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
html = html.replace(
  /<meta name="description"[^>]*>/,
  `<meta name="description" content="${esc(description)}" />`,
);

// Add canonical + Open Graph + Twitter Card tags just before </head>.
const tags = [
  `<link rel="canonical" href="${esc(url)}" />`,
  `<meta property="og:type" content="website" />`,
  `<meta property="og:site_name" content="${esc(name)}" />`,
  `<meta property="og:title" content="${esc(title)}" />`,
  `<meta property="og:description" content="${esc(description)}" />`,
  `<meta property="og:url" content="${esc(url)}" />`,
  ...(ogImage
    ? [
        `<meta property="og:image" content="${esc(ogImage)}" />`,
        ...(isCard
          ? [
              `<meta property="og:image:type" content="image/png" />`,
              `<meta property="og:image:width" content="1200" />`,
              `<meta property="og:image:height" content="630" />`,
            ]
          : []),
      ]
    : []),
  `<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />`,
  `<meta name="twitter:title" content="${esc(title)}" />`,
  `<meta name="twitter:description" content="${esc(description)}" />`,
  ...(ogImage ? [`<meta name="twitter:image" content="${esc(ogImage)}" />`] : []),
]
  .map((t) => `    ${t}`)
  .join("\n");
if (!html.includes("</head>")) throw new Error("generate-seo: no </head> in index.html");
html = html.replace("</head>", `${tags}\n  </head>`);

writeFileSync(indexPath, html);

// robots.txt — allow everything and point at the sitemap.
writeFileSync(join(distDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${url}sitemap.xml\n`);

// sitemap.xml — a single-page status site.
writeFileSync(
  join(distDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${esc(url)}</loc>\n  </url>\n</urlset>\n`,
);

console.log(`velvet: injected SEO into ${indexPath}; wrote robots.txt + sitemap.xml (${url})`);
