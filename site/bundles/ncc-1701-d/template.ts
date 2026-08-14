/**
 * The markup NCC-1701-D puts on the page, built from the data it was given.
 *
 * A divided column of coloured segments carrying the service names, two limbs
 * enclosing the notices and the readings, and a table of events rather than a
 * stack of cards. The structure is the column: every service is a segment of it
 * with its readings beside it, which is why the name stands in a rail of its own
 * rather than inside the button.
 *
 * Three things this design carries that no other does. The headline is the
 * interrupted upper arm of the limb around the notices, so the hero emits a
 * filled block between the column's head and the words. The foot of the
 * readings closes that limb the other way up and carries the release and the
 * serial as two segments cut out of it, which is why the footer states neither.
 * No design carries a bar at the top any more, and this one named the
 * installation nowhere even when it did.
 *
 * A string rather than a tree, because the same function runs in the build,
 * which has no DOM, and in a preview frame, which does. Everything the page
 * says is decided here; the script only reacts to what a visitor does.
 */

import { overallStatus, uptimeForRange, visibleEvents } from "@velvet/bundle-plugins/status";

import type { BundleData } from "../../src/lib/bundles/data.js";
import { escape, formatUpdated, panelDate, RANGES } from "./format.js";

/** What each overall state says at the top of the page. */
const HEADLINE: Record<string, string> = {
  operational: "All systems operational",
  unknown: "System status unavailable",
  degraded: "Some systems degraded",
  outage: "Major service outage",
};

/** A Phosphor glyph, which this design draws only on the two disclosures. */
function icon(name: string, className: string): string {
  return `<i class="${className} ph-duotone ${name}" aria-hidden="true"></i>`;
}

/**
 * The one line naming the state, built into the shape around the notices.
 *
 * The bar is a filled block between the column's head and the words. It says
 * nothing, so it is hidden from anything that reads the page aloud.
 */
function hero(data: BundleData, state: string): string {
  return `<div class="status-band status-band--hero">
    <div class="status-hero">
      <span class="status-hero-bar" aria-hidden="true"></span>
      <h1 class="status-hero-title">${escape(HEADLINE[state] ?? HEADLINE.unknown!)}</h1>
      <p class="status-hero-updated">Last updated ${escape(formatUpdated(data.generatedAt))}</p>
    </div>
  </div>`;
}

/** One row of the table of events: the date, the claim, and the message. */
function notice(
  event: BundleData["incidents"]["events"][number],
): string {
  return `<div class="notice notice--${escape(event.kind)}">
    <span class="notice-date">${escape(panelDate(new Date(event.startsAt)))}</span>
    <span class="notice-title">${escape(event.title)}</span>
    <span class="notice-summary">${escape(event.summary)}</span>
  </div>`;
}

/** Everything being reported, as one table with one set of column widths. */
function notices(data: BundleData): string {
  const visible = visibleEvents(data.incidents.events);
  const maintenance = visible.filter((event) => event.kind === "maintenance");
  const incidents = visible.filter((event) => event.kind === "incident");
  const heading =
    incidents.length > 0
      ? `<h2 class="notices-heading">Active incidents</h2>`
      : "";
  return `<section class="notices">${maintenance.map(notice).join("")}${heading}${incidents
    .map(notice)
    .join("")}</section>`;
}

/**
 * The range controls, inside the arm of the elbow.
 *
 * The installation is named nowhere on this design, so the label the other
 * designs put at the leading edge of this bar is not emitted at all.
 */
function rangeBar(data: BundleData): string {
  const buttons = RANGES.map(
    (option) =>
      `<button class="range-button" type="button" data-range="${option.key}" aria-pressed="${String(
        option.key === data.site.defaultRange,
      )}" aria-label="${escape(option.description)}">${option.label}</button>`,
  ).join("");
  return `<div class="range-bar">
    <div class="ranges">
      <span class="range-mark" aria-hidden="true"></span>
      ${buttons}
    </div>
    <button class="toggle-all" type="button" aria-label="Expand all" title="Expand all">
      ${icon("ph-caret-circle-double-down", "toggle-all-glyph")}
    </button>
  </div>`;
}

/** The two protocol badges, where there is anything to tell apart. */
function protocols(service: BundleData["status"]["services"][number]): string {
  const only =
    service.checks.length === 1 && service.checks[0]?.protocol === "ipv4";
  if (only) return "";
  const badges = service.checks
    .map(
      (check) =>
        `<span class="protocol-badge" data-protocol="${escape(check.protocol)}" data-present="true" data-status="${escape(check.status)}">${
          check.protocol === "ipv6" ? "IPv6" : "IPv4"
        }</span>`,
    )
    .join("");
  return `<span class="service-protocols" aria-label="Protocol reachability">${badges}</span>`;
}

/** What each protocol last answered, behind the control that opens the row. */
function readings(service: BundleData["status"]["services"][number]): string {
  return service.checks
    .map((check, index) => {
      const separator =
        index > 0
          ? `<span class="protocol-separator" aria-hidden="true">|</span>`
          : "";
      const name = check.protocol === "ipv6" ? "IPv6" : "IPv4";
      const latency =
        check.responseTimeMs === null
          ? "unavailable"
          : `${Math.round(check.responseTimeMs)} ms`;
      return `${separator}<div class="protocol-reading" role="listitem" data-protocol="${escape(check.protocol)}" data-status="${escape(check.status)}">
        <span class="protocol-name">${name}</span>
        <span class="protocol-value">
          <strong class="protocol-state">${escape(check.status === "operational" ? "up" : check.status)}</strong>
          <span class="protocol-latency">${escape(latency)}</span>
        </span>
      </div>`;
    })
    .join("");
}

/**
 * One service: a segment of the column, with everything the row shows beside it.
 *
 * The rail repeats the name the button is labelled with, so it is hidden from
 * anything that reads the page aloud. The button carries name, figure and
 * protocols in its own label, because `aria-label` replaces the contents rather
 * than adding to them and the button's contents are no longer the name.
 */
function service(
  data: BundleData,
  entry: BundleData["status"]["services"][number],
): string {
  const figure = uptimeForRange(
    entry,
    data.site.defaultRange,
    data.status.generatedAt,
    data.status.monitoringStartedAt,
  );
  const spoken = entry.checks
    .map((check) => (check.protocol === "ipv6" ? "IPv6" : "IPv4"))
    .join(" and ");
  return `<article class="service" data-service-id="${escape(entry.id)}" data-open="false">
    <span class="service-rail" aria-hidden="true">${escape(entry.name)}</span>
    <button class="service-summary" type="button" aria-expanded="false" aria-controls="details-${escape(entry.id)}" aria-label="${escape([entry.name, `${figure} uptime`, spoken].filter(Boolean).join(", "))}">
      ${protocols(entry)}
      <span class="service-uptime">${escape(figure)} uptime</span>
      ${icon("ph-caret-circle-down", "service-chevron")}
    </button>
    <div class="uptime-strip-host"></div>
    <div class="strip-axis">
      <span class="strip-axis-from"></span>
      <span class="strip-axis-to">Today</span>
    </div>
    <div class="service-details-wrap" id="details-${escape(entry.id)}">
      <div class="service-details">
        <div class="protocol-readings" role="list" aria-label="Protocol status">${readings(entry)}</div>
        <div class="response-chart">
          <p class="chart-caption">Response time</p>
          <div class="chart-legend" role="list" aria-label="Response time series"></div>
          <div class="chart-plot"></div>
          <div class="chart-axis-row" aria-hidden="true">
            <span class="chart-axis-from"></span>
            <span class="chart-axis-to">Now</span>
          </div>
        </div>
      </div>
    </div>
  </article>`;
}

/**
 * Every service in one card, and the arm that closes the column under them.
 *
 * The arm carries the release and the serial as two segments cut out of it,
 * which is why it is not hidden from a reader who hears the page. Everything
 * else it draws is decoration.
 */
function services(data: BundleData): string {
  const rows = data.status.services.map((entry) => service(data, entry)).join("");
  const serial =
    data.site.serial === null ? "—" : String(data.site.serial).padStart(5, "0");
  return `<div class="service-list">
    <section class="service-card">${rows}</section>
    <div class="service-foot">
      <span class="service-foot-version">v${escape(data.site.version)}</span>
      <span class="service-foot-serial">Serial #${escape(serial)}</span>
    </div>
  </div>`;
}

/**
 * The credit alone.
 *
 * The release and the serial are in the arm above, so the footer states
 * neither: the page states each figure once.
 */
function footer(): string {
  return `<div class="status-band status-band--footer">
    <footer class="status-footer">
      <div class="powered">
        <span class="powered-label">powered by</span>
        <span class="velvet-wordmark">Velvet</span>
      </div>
    </footer>
  </div>`;
}

/**
 * The whole page.
 *
 * @param data - The status data the host validated and handed over.
 * @returns The markup, with one root element carrying the design's own class.
 */
export function template(data: BundleData): string {
  const state = overallStatus(data.status.services);
  // Nothing is wrong, so nothing is being reported. This design draws a limb
  // around the notices, and a limb around an empty region is a shape with
  // nothing in it.
  const reporting =
    state !== "operational" && visibleEvents(data.incidents.events).length > 0;

  return `<main class="ncc-1701-d-page" data-layout="grouped" data-status="${escape(state)}" data-notices="${reporting ? "some" : "none"}">
    ${hero(data, state)}
    <div class="status-band status-band--body">
      <div class="status-body">
        ${notices(data)}
        ${rangeBar(data)}
        ${services(data)}
      </div>
    </div>
    ${footer()}
  </main>`;
}

export default template;
