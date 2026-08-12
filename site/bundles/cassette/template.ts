/**
 * The markup Cassette puts on the page, built from the data it was given.
 *
 * A rack of separate components. Each service is a brushed faceplate bolted
 * between two walnut cheeks, carrying a recessed name plate lit from behind,
 * two protocol lamps, a two-line readout and a lamp meter for its days. There
 * is not one picture anywhere on it, which is why nothing here emits an icon:
 * where another design draws a chevron this one presses a key, and where
 * another shows a glyph above the headline this one stands a striped sun
 * behind it.
 *
 * Two consequences for the markup. Every service gets a card of its own,
 * because a rack is separate components rather than one panel with rows in it,
 * and both protocol lamps stand on every row whether or not the service was
 * measured on both: a lamp that is out is a reading.
 *
 * A string rather than a tree, because the same function runs in the build,
 * which has no DOM, and in a preview frame, which does. Everything the page
 * says is decided here; the script only reacts to what a visitor does.
 */

import { overallStatus, uptimeForRange, visibleEvents } from "@velvet/bundle-plugins/status";

import type { BundleData } from "../../src/lib/bundles/data.js";
import { escape, formatEventTime, formatUpdated, RANGES, STATE_WORD } from "./format.js";

/** What each overall state says at the top of the page. */
const HEADLINE: Record<string, string> = {
  operational: "All systems operational",
  unknown: "System status unavailable",
  degraded: "Some systems degraded",
  outage: "Major service outage",
};

/**
 * The key that opens a row.
 *
 * It carries no text of its own: the stylesheet states the two characters,
 * because which character says "this opens" is a design decision rather than a
 * fact about the row. Hidden from assistive technology, since the button
 * around it already says what it does.
 */
/**
 * The key that opens something, on its own or under the plate naming what it
 * opens.
 *
 * A row's key carries the plate, because that is the part of the face reporting
 * whether the plot below it is out. The control in the bar opens every row at
 * once and names itself in words beside the ranges, so it is the key alone.
 *
 * @param labelled - Whether to draw the plate above the key.
 * @returns The markup for the key, decorative throughout: what it does is said
 *   by the control around it.
 */
function key(labelled = false): string {
  const plate = labelled
    ? `<span class="disclosure-label">OPEN</span>`
    : "";
  return `<span class="disclosure-stack" aria-hidden="true">
      ${plate}
      <span class="disclosure-mark"></span>
    </span>`;
}

/**
 * The one line naming the state, with the striped sun standing behind it.
 *
 * The mark is emitted without a glyph inside it, because the shape is what this
 * design shows there and a picture would be a second thing saying the same.
 *
 * The page's name is written across the sun's middle band, which is where a
 * poster of this period prints it, so the range bar below shows no label.
 */
function hero(data: BundleData, state: string): string {
  return `<div class="status-band status-band--hero">
    <div class="status-hero">
      <span class="status-hero-mark" aria-hidden="true"></span>
      <p class="status-hero-name">${escape(data.site.name)}</p>
      <h1 class="status-hero-title">${escape(HEADLINE[state] ?? HEADLINE.unknown!)}</h1>
      <p class="status-hero-updated">Last updated ${escape(formatUpdated(data.generatedAt))}</p>
    </div>
  </div>`;
}

/** One maintenance window or incident, as the page announces it. */
function notice(event: BundleData["incidents"]["events"][number]): string {
  const started = new Date(event.startsAt);
  const meta =
    event.kind === "maintenance"
      ? `${escape(event.state)} · ${escape(formatEventTime(started))}`
      : `Started ${escape(formatEventTime(started))}`;
  return `<div class="notice notice--${escape(event.kind)}">
    <span class="notice-title">${escape(event.title)}</span>
    <span class="notice-summary">${escape(event.summary)}</span>
    <span class="notice-meta">${meta}</span>
  </div>`;
}

/** Everything being reported, maintenance first and incidents under a heading. */
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

/** The range controls, with the key that opens every row at the trailing end. */
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
      ${key()}
    </button>
  </div>`;
}


/**
 * Both protocol lamps, always.
 *
 * A design that treats them as labels hides whatever was not measured. This one
 * draws them as two lamps and leaves the unmeasured one dark, so the pair is
 * emitted whatever the service has.
 */
function protocols(service: BundleData["status"]["services"][number]): string {
  const badges = (["ipv4", "ipv6"] as const)
    .map((protocol) => {
      const check = service.checks.find((entry) => entry.protocol === protocol);
      const status = check ? ` data-status="${escape(check.status)}"` : "";
      return `<span class="protocol-badge" data-protocol="${protocol}" data-present="${String(Boolean(check))}"${status}>${
        protocol === "ipv6" ? "IPv6" : "IPv4"
      }</span>`;
    })
    .join("");
  const single =
    service.checks.length === 1 && service.checks[0]?.protocol === "ipv4";
  return `<span class="service-protocols" aria-label="Protocol reachability" data-single="${String(single)}">${badges}</span>`;
}

/** What each protocol last answered, behind the key that opens the row. */
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
 * One service, as a component in the rack.
 *
 * The readout between the name plate and the key is two lines, with the uptime
 * figure at the end of the first. At rest it names the service's own state and
 * the window it is reporting on, which is what a machine of this kind shows
 * when nobody is touching it; the strip and the chart write their readings into
 * it rather than drawing an overlay.
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
  const window = RANGES.find((option) => option.key === data.site.defaultRange);
  return `<article class="service" data-service-id="${escape(entry.id)}" data-open="false">
    <button class="service-summary" type="button" aria-expanded="false" aria-controls="details-${escape(entry.id)}" aria-label="${escape([entry.name, `${figure} uptime`, spoken].filter(Boolean).join(", "))}">
      <span class="service-name">${escape(entry.name)}</span>
      ${protocols(entry)}
      <span class="service-display">
        <span class="service-display-line">
          <span class="service-display-main">${escape(STATE_WORD[entry.status] ?? "No data")}</span>
          <span class="service-uptime">${escape(figure)} Uptime</span>
        </span>
        <span class="service-display-line">${escape(window?.description ?? "")}</span>
      </span>
      ${key(true)}
    </button>
    <div class="uptime-strip-host"></div>
    <div class="strip-axis">
      <span class="strip-axis-from"></span>
      <span class="strip-axis-to">Today</span>
    </div>
    <div class="service-details-wrap" id="details-${escape(entry.id)}">
      <div class="service-details">
        <div class="protocol-readings" role="list" aria-label="Protocol status">${readings(entry)}</div>
        <div class="chart-host"></div>
      </div>
    </div>
  </article>`;
}

/** Every service in a component of its own, which is what a rack is. */
function services(data: BundleData): string {
  const ornament = `<span class="card-ornament" aria-hidden="true"></span>`;
  const rows = data.status.services
    .map(
      (entry) =>
        `<section class="service-card">${ornament}${service(data, entry)}</section>`,
    )
    .join("");
  return `<div class="service-list">${rows}</div>`;
}

/** The credit, the release and the serial, on one row under the rack. */
function footer(data: BundleData): string {
  const serial =
    data.site.serial === null ? "—" : String(data.site.serial).padStart(5, "0");
  return `<div class="status-band status-band--footer">
    <footer class="status-footer">
      <div class="powered">
        <span class="powered-label">powered by</span>
        <span class="velvet-wordmark">Velvet</span>
      </div>
      <div class="status-footer-row">
        <p class="stamp stamp--build">v${escape(data.site.version)}</p>
        <p class="configured">Configured by its operator at <a href="${escape(data.site.configuredAt.href)}" rel="noopener noreferrer" target="_blank">${escape(data.site.configuredAt.label)}</a></p>
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
  const reporting =
    state !== "operational" && visibleEvents(data.incidents.events).length > 0;

  return `<main class="cassette-page" data-layout="cards" data-status="${escape(state)}" data-notices="${reporting ? "some" : "none"}">
    ${hero(data, state)}
    <div class="status-band status-band--body">
      <div class="status-body">
        ${notices(data)}
        ${rangeBar(data)}
        ${services(data)}
      </div>
    </div>
    ${footer(data)}
  </main>`;
}

export default template;
