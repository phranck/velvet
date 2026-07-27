import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateIncidentsDocument } from "@velvet/contracts";

/**
 * Generate the static Atom feed from Velvet's validated incident document.
 *
 * Usage: node generate-feed.mjs <config.json> <incidents.json> <out/incidents.atom>
 */
const [
  ,
  ,
  configPath = "public/config.json",
  incidentsPath = "velvet-data/v1/incidents.json",
  outPath = "public/incidents.atom",
] = process.argv;

const FEED_MAX_ENTRIES = 30;
const SUMMARY_MAX_CHARS = 600;

const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const { owner, repo, name = repo } = cfg;
const cnameFile = join(dirname(configPath), "CNAME");
const baseUrl = String(
  cfg.url ??
    (existsSync(cnameFile)
      ? `https://${readFileSync(cnameFile, "utf8").trim()}/`
      : `https://${owner}.github.io/${repo}/`),
).replace(/\/+$/, "");

const result = validateIncidentsDocument(
  JSON.parse(readFileSync(incidentsPath, "utf8")),
);
if (!result.success) {
  throw new Error("Velvet incidents data is invalid.");
}
const incidents = result.data;

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function titleCase(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function renderEntry(event) {
  const kind = event.kind === "maintenance" ? "Maintenance" : "Incident";
  const updated = event.endsAt ?? event.startsAt;
  const eventUrl = `${baseUrl}/#${encodeURIComponent(event.id)}`;
  return `  <entry>
    <id>urn:velvet:event:${xml(event.id)}</id>
    <title>${xml(`${kind} · ${titleCase(event.state)}: ${event.title}`)}</title>
    <link rel="alternate" href="${xml(eventUrl)}"/>
    <published>${xml(event.startsAt)}</published>
    <updated>${xml(updated)}</updated>
    <summary>${xml(event.summary.slice(0, SUMMARY_MAX_CHARS))}</summary>
  </entry>`;
}

const entries = [...incidents.events]
  .sort((left, right) => right.startsAt.localeCompare(left.startsAt))
  .slice(0, FEED_MAX_ENTRIES)
  .map(renderEntry);
const feedUrl = `${baseUrl}/incidents.atom`;

const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${xml(name)} — Status</title>
  <subtitle>Incidents and scheduled maintenance</subtitle>
  <id>${xml(feedUrl)}</id>
  <link rel="self" href="${xml(feedUrl)}"/>
  <link rel="alternate" href="${xml(`${baseUrl}/`)}"/>
  <updated>${xml(incidents.generatedAt)}</updated>
${entries.join("\n")}
</feed>
`;

writeFileSync(outPath, feed);
console.log(
  `velvet: wrote ${outPath} (${entries.length} event${entries.length === 1 ? "" : "s"})`,
);
