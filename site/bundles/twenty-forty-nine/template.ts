/**
 * The markup Twenty Forty-Nine puts on the page, built from the data it was
 * given.
 *
 * A filthy pane of glass with a dim blue readout behind it. Every card carries
 * an ornament element the stylesheet draws corner brackets and edge scales on,
 * because doing that with real elements would mean sixteen of them per card.
 *
 * A string rather than a tree, because the same function runs in the build,
 * which has no DOM, and in a preview frame, which does. Everything the page
 * says is decided here; the script only reacts to what a visitor does.
 */

import { overallStatus, uptimeForRange, visibleEvents } from "@velvet/bundle-plugins/status";

import type { BundleData } from "../../src/lib/bundles/data.js";
import { escape, formatEventTime, formatUpdated, RANGES } from "./format.js";

/** What each overall state says, and the glyph standing above it. */
export const HEADLINE: Record<string, { text: string; icon: string }> = {
  operational: { text: "All systems operational", icon: "ph-check-circle" },
  unknown: { text: "System status unavailable", icon: "ph-question" },
  degraded: { text: "Some systems degraded", icon: "ph-warning" },
  outage: { text: "Major service outage", icon: "ph-x-circle" },
};

/**
 * The Phosphor class for a service, matching what `site/src/lib/icons.ts`
 * resolves in the product.
 *
 * A service whose configured key names nothing here gets `ph-circle`, which is
 * the documented default.
 */
const ICONS: Record<string, string> = {
  globe: "ph-globe",
  brackets: "ph-brackets-curly",
  cloud: "ph-cloud",
  envelope: "ph-envelope-simple",
  database: "ph-database",
};

/** A Phosphor glyph, drawn the way the product draws one. */
function icon(name: string, className: string): string {
  return `<i class="${className} ph-duotone ${name}" aria-hidden="true"></i>`;
}

/** The one line naming the state, with the mark above it and the time below. */
function hero(data: BundleData, state: string): string {
  const announced = HEADLINE[state] ?? HEADLINE.unknown!;
  return `<div class="status-band status-band--hero">
    <div class="status-hero">
      <span class="status-hero-mark" aria-hidden="true">${icon(announced.icon, "status-hero-glyph")}</span>
      <h1 class="status-hero-title">${escape(announced.text)}</h1>
      <p class="status-hero-updated">Last updated ${escape(formatUpdated(data.generatedAt))}</p>
    </div>
  </div>`;
}

/** One maintenance window or incident, as the page announces it. */
function notice(
  event: ReturnType<typeof visibleEvents<BundleData["incidents"]["events"][number]>>[number],
): string {
  const started = new Date(event.startsAt);
  const glyph =
    event.kind === "maintenance" ? icon("ph-wrench", "notice-glyph") : "";
  const meta =
    event.kind === "maintenance"
      ? `${escape(event.state)} · ${escape(formatEventTime(started))}`
      : `Started ${escape(formatEventTime(started))}`;
  return `<div class="notice notice--${escape(event.kind)}">
    ${glyph}
    <span class="notice-title">${escape(event.title)}</span>
    <span class="notice-summary">${escape(event.summary)}</span>
    <span class="notice-meta">${meta}</span>
  </div>`;
}

/**
 * Everything being reported, maintenance first and incidents under a heading.
 *
 * A page announcing that every service is up whilst listing an open incident
 * contradicts itself, so the region says whether it holds anything and the
 * stylesheet answers.
 */
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

/** The range controls, with the travelling mark the script places. */
function rangeBar(data: BundleData): string {
  const buttons = RANGES.map(
    (option) =>
      `<button class="range-button" type="button" data-range="${option.key}" aria-pressed="${String(
        option.key === data.site.defaultRange,
      )}" aria-label="${escape(option.description)}">${option.label}</button>`,
  ).join("");
  return `<div class="range-bar">
    <span class="group-name">${escape(data.site.name.toUpperCase())}</span>
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
 * One service row.
 *
 * The button is labelled explicitly and with everything the row reports,
 * because `aria-label` replaces the contents rather than adding to them: a
 * label carrying only the name would stop the uptime figure being announced.
 * The script rewrites it whenever the range changes the figure.
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
  const glyph = ICONS[data.site.icons[entry.id] ?? ""] ?? "ph-circle";
  return `<article class="service" data-service-id="${escape(entry.id)}" data-open="false">
    <button class="service-summary" type="button" aria-expanded="false" aria-controls="details-${escape(entry.id)}" aria-label="${escape([entry.name, `${figure} uptime`, spoken].filter(Boolean).join(", "))}">
      ${icon(glyph, "service-icon")}
      <span class="service-name">${escape(entry.name)}</span>
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

/** Every service, in one card or in one card each. */
function services(data: BundleData, layout: string): string {
  const rows = data.status.services.map((entry) => service(data, entry));
  // A surface of its own, because the card's two pseudo-elements are already
  // the rail and the masked edge.
  const ornament = `<span class="card-ornament" aria-hidden="true"></span>`;
  const body =
    layout === "cards"
      ? rows
          .map((row) => `<section class="service-card">${ornament}${row}</section>`)
          .join("")
      : `<section class="service-card">${ornament}${rows.join("")}</section>`;
  return `<div class="service-list">${body}</div>`;
}

/** The credit, the release and the serial number, on one row. */
function footer(data: BundleData): string {
  const serial =
    data.site.serial === null
      ? "—"
      : String(data.site.serial).padStart(5, "0");
  return `<div class="status-band status-band--footer">
    <footer class="status-footer">
      <div class="powered">
        <span class="powered-label">powered by</span>
        <span class="velvet-wordmark">Velvet</span>
      </div>
      <div class="status-footer-row">
        <p class="stamp stamp--build">v${escape(data.site.version)}</p>
        <p class="stamp stamp--serial">Serial #${escape(serial)}</p>
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
  const layout = data.site.layout === "cards" ? "cards" : "grouped";
  // Nothing is wrong, so nothing is being reported: a page announcing that
  // every service is up whilst listing an open incident contradicts itself.
  const reporting =
    state !== "operational" && visibleEvents(data.incidents.events).length > 0;

  return `<main class="twenty-forty-nine-page" data-layout="${layout}" data-status="${escape(state)}" data-notices="${reporting ? "some" : "none"}">
    ${hero(data, state)}
    <div class="status-band status-band--body">
      <div class="status-body">
        ${notices(data)}
        ${rangeBar(data)}
        ${services(data, layout)}
      </div>
    </div>
    ${footer(data)}
  </main>`;
}

export default template;
