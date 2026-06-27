import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Generate a static Atom feed of incidents for a Velvet status page.
 *
 * A static (GitHub Pages) status page cannot serve a live feed itself, so the
 * feed is materialised at build time from the monitoring repo's GitHub Issues
 * (Upptime models every incident and maintenance window as an issue). The
 * consumer workflow re-runs the Velvet build on `issues` events, so the
 * published `/incidents.atom` refreshes within a build of each incident change.
 *
 * Resilient by design: any failure (rate limit, transport, malformed payload)
 * still writes a valid, empty feed so `/incidents.atom` always exists and the
 * site build never breaks.
 *
 * Usage: node generate-feed.mjs <config.json> <out/incidents.atom>
 */
const [, , configPath = "public/config.json", outPath = "public/incidents.atom"] = process.argv;

/** Maximum number of incidents to include, newest first. */
const FEED_MAX_ENTRIES = 30;
/** Per-entry body excerpt length, in characters. */
const SUMMARY_MAX_CHARS = 600;

const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const { owner, repo, name = repo } = cfg;

// Site base URL: the custom domain (CNAME) when present, else the Pages default.
const cnameFile = join(dirname(configPath), "CNAME");
const baseUrl = existsSync(cnameFile)
  ? `https://${readFileSync(cnameFile, "utf8").trim()}`
  : `https://${owner}.github.io/${repo}`;

/**
 * XML-escape a value for safe inclusion in element text or attributes.
 *
 * @param value - any value; coerced to string before escaping
 * @returns the value with `& < > "` replaced by entities
 */
function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Normalise a GitHub label (string or object) to its name.
 *
 * @param label - a label string or `{ name }` object from the issues API
 * @returns the label name, or an empty string when absent
 */
function labelName(label) {
  return typeof label === "string" ? label : (label?.name ?? "");
}

/**
 * Fetch the most recent incidents (open and closed) from the monitoring repo.
 * Sends `GITHUB_TOKEN` when present to lift the unauthenticated rate limit.
 *
 * @returns the issues array with pull requests filtered out
 * @throws when the GitHub API responds non-OK
 */
async function fetchIncidents() {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=${FEED_MAX_ENTRIES}&sort=updated&direction=desc`;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "velvet-feed" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub issues ${res.status}`);
  const issues = await res.json();
  // The issues endpoint also returns pull requests — drop them.
  return issues.filter((i) => !i.pull_request);
}

/**
 * Render one incident issue as an Atom `<entry>`.
 *
 * @param issue - a GitHub issue representing an incident or maintenance window
 * @returns the serialized `<entry>` XML
 */
function renderEntry(issue) {
  const resolved = issue.state === "closed";
  const maintenance = (issue.labels ?? []).map(labelName).includes("maintenance");
  const kind = maintenance ? "Maintenance" : "Incident";
  const phase = resolved ? "Resolved" : "Ongoing";
  const updated = new Date(issue.closed_at ?? issue.updated_at ?? issue.created_at).toISOString();
  const published = new Date(issue.created_at).toISOString();
  const summary = (issue.body ?? "").trim().slice(0, SUMMARY_MAX_CHARS);
  return `  <entry>
    <id>${xml(issue.html_url)}</id>
    <title>${xml(`${kind} · ${phase}: ${issue.title}`)}</title>
    <link rel="alternate" href="${xml(issue.html_url)}"/>
    <published>${published}</published>
    <updated>${updated}</updated>
    <summary>${xml(summary)}</summary>
  </entry>`;
}

let entries = [];
try {
  entries = (await fetchIncidents()).map(renderEntry);
} catch (err) {
  console.warn(`velvet: incident feed falling back to empty — ${err.message}`);
}

const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${xml(name)} — Status</title>
  <subtitle>Incidents and scheduled maintenance</subtitle>
  <id>${xml(`${baseUrl}/incidents.atom`)}</id>
  <link rel="self" href="${xml(`${baseUrl}/incidents.atom`)}"/>
  <link rel="alternate" href="${xml(`${baseUrl}/`)}"/>
  <updated>${new Date().toISOString()}</updated>
${entries.join("\n")}
</feed>
`;

writeFileSync(outPath, feed);
console.log(`velvet: wrote ${outPath} (${entries.length} incident${entries.length === 1 ? "" : "s"})`);
