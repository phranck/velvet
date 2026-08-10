/**
 * The markup this design puts on the page, built from the data it was given.
 *
 * A string rather than a tree, because the same function runs in the build,
 * which has no DOM, and in a preview frame, which does. Everything the page
 * says is decided here; the script only reacts to what a visitor does.
 */

import type { BundleData } from "../../src/lib/bundles/data.js";
import { overall, RANGES, uptimeFor, visibleEvents } from "./uptime.js";

/** What each overall state says at the top of the page. */
const HEADLINE: Record<string, string> = {
  operational: "All systems operational",
  unknown: "System status unavailable",
  degraded: "Some systems degraded",
  outage: "Major service outage",
};

/**
 * Escapes text for markup.
 *
 * The bundle carries its own rather than importing one, because a service name
 * comes from an operator's configuration and a design that borrowed this from
 * somewhere else would be a design that stops being self-contained over a
 * function of four replacements.
 *
 * @param value - Anything that came from the data.
 * @returns The same text, safe between tags and inside an attribute.
 */
function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** One service, with its name, its figure and the readings behind a button. */
function service(data: BundleData, id: string, name: string, range: string): string {
  const entry = data.status.services.find((candidate) => candidate.id === id);
  const readings = (entry?.checks ?? [])
    .map(
      (check) =>
        `<li class="proof-reading" data-status="${escape(check.status)}">
           <span class="proof-reading-name">${check.protocol === "ipv6" ? "IPv6" : "IPv4"}</span>
           <span class="proof-reading-value">${
             check.responseTimeMs === null
               ? "unavailable"
               : `${Math.round(check.responseTimeMs)} ms`
           }</span>
         </li>`,
    )
    .join("");
  const figure = uptimeFor(data, id, range);
  return `<article class="proof-service" data-service="${escape(id)}" data-status="${escape(entry?.status ?? "unknown")}">
    <button class="proof-summary" type="button" aria-expanded="false" aria-controls="proof-details-${escape(id)}">
      <span class="proof-service-name">${escape(name)}</span>
      <span class="proof-uptime" data-uptime-for="${escape(id)}">${escape(figure)} uptime</span>
    </button>
    <div class="proof-details" id="proof-details-${escape(id)}" hidden>
      <ul class="proof-readings">${readings}</ul>
    </div>
  </article>`;
}

/** One incident or maintenance window, as the page announces it. */
function event(entry: ReturnType<typeof visibleEvents>[number]): string {
  return `<li class="proof-event" data-kind="${escape(entry.kind)}">
    <span class="proof-event-title">${escape(entry.title)}</span>
    <span class="proof-event-summary">${escape(entry.summary)}</span>
  </li>`;
}

/**
 * The whole page.
 *
 * @param data - The status data the host validated and handed over.
 * @returns The markup, with one root element carrying the design's own class.
 */
export function template(data: BundleData): string {
  const range = data.site.defaultRange;
  const state = overall(data);
  const events = visibleEvents(data);
  const ranges = RANGES.map(
    ({ key, label }) =>
      `<button class="proof-range" type="button" data-range="${key}" aria-pressed="${String(key === range)}">${label}</button>`,
  ).join("");

  return `<div class="proof-page" data-bundle="proof" data-state="${escape(state)}" data-range="${escape(range)}">
    <header class="proof-head">
      <p class="proof-brand">${escape(data.site.name)}</p>
      <nav class="proof-nav" aria-label="Site">
        ${data.site.navigation
          .map(
            (link) =>
              `<a class="proof-nav-link" href="${escape(link.href)}">${escape(link.title)}</a>`,
          )
          .join("")}
      </nav>
    </header>

    <h1 class="proof-headline">${escape(HEADLINE[state] ?? HEADLINE.unknown!)}</h1>
    <p class="proof-generated">Last updated ${escape(data.generatedAt)}</p>

    ${
      events.length > 0
        ? `<section class="proof-events" aria-label="Active incidents and maintenance">
             <h2 class="proof-events-heading">Active incidents</h2>
             <ul class="proof-event-list">${events.map(event).join("")}</ul>
           </section>`
        : ""
    }

    <div class="proof-ranges" role="group" aria-label="Range">${ranges}</div>

    <section class="proof-services" aria-label="Services">
      ${data.status.services
        .map((entry) => service(data, entry.id, entry.name, range))
        .join("")}
    </section>

    <footer class="proof-foot">
      <p class="proof-stamp">v${escape(data.site.version)}</p>
      <p class="proof-serial">Serial #${escape(
        data.site.serial === null ? "—" : String(data.site.serial).padStart(5, "0"),
      )}</p>
      <p class="proof-configured">Configured by its operator at
        <a href="${escape(data.site.configuredAt.href)}" rel="noopener noreferrer">${escape(data.site.configuredAt.label)}</a>
      </p>
    </footer>
  </div>`;
}

export default template;
