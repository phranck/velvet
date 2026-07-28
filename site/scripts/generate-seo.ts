import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateStatusDocument } from "@velvet/contracts";
import { overallStatus, STATUS_HERO } from "../src/lib/data";

/**
 * Inject per-deployment SEO into a built Velvet site using the same validated
 * status document and status interpretation as the browser and social card.
 *
 * Usage: bun generate-seo.ts <config.json> <status.json> <dist-dir>
 */
const [
  ,
  ,
  configPath = "public/config.json",
  statusPath = "velvet-data/v1/status.json",
  distDir = "dist",
] = process.argv;
const config = JSON.parse(readFileSync(configPath, "utf8"));
const statusResult = validateStatusDocument(
  JSON.parse(readFileSync(statusPath, "utf8")),
);
if (!statusResult.success) {
  throw new Error("Velvet status data is invalid.");
}

const name = config.name ?? config.repo ?? "Status";
const url = config.url ?? "/";
const statusCopy = STATUS_HERO[overallStatus(statusResult.data.services)].text;
const seo = config.seo ?? {};
const title = seo.title ?? `${name} — Status`;
const description =
  seo.description ?? `${statusCopy}. Live status and uptime history for ${name}.`;

const cardImage = existsSync(join(distDir, "og.png")) ? `${url}og.png` : null;
const ogImage = seo.image
  ? /^https?:\/\//.test(seo.image)
    ? seo.image
    : new URL(String(seo.image).replace(/^\//, ""), url).href
  : cardImage;
const isCard = ogImage !== null && ogImage === cardImage;

const esc = (value: string): string =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const indexPath = join(distDir, "index.html");
let html = readFileSync(indexPath, "utf8");
html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
html = html.replace(
  /<meta name="description"[^>]*>/,
  `<meta name="description" content="${esc(description)}" />`,
);

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
  .map((tag) => `    ${tag}`)
  .join("\n");
if (!html.includes("</head>")) {
  throw new Error("generate-seo: no </head> in index.html");
}
html = html.replace("</head>", `${tags}\n  </head>`);

writeFileSync(indexPath, html);
writeFileSync(
  join(distDir, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${url}sitemap.xml\n`,
);
writeFileSync(
  join(distDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${esc(url)}</loc>\n  </url>\n</urlset>\n`,
);

console.log(
  `velvet: injected SEO into ${indexPath}; wrote robots.txt + sitemap.xml (${url})`,
);
