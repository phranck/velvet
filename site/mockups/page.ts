/**
 * The whole status page, assembled once and re-rendered where the data changes.
 *
 * This is the part every theme shares. The markup below is identical for all
 * four designs, and every difference between them is a token in the stylesheet
 * that dresses it. That is the claim `documentation/theme-authoring.md` makes,
 * and this file is where it either holds or does not.
 *
 * The arithmetic is not reimplemented here. `barsForRange`, `uptimeForRange`,
 * `overallStatus`, `visibleIncidentEvents`, `RANGE_LABEL` and `STATUS_HERO` are
 * imported from `site/src/lib/data.ts`, the same module the published page
 * uses, so a mockup cannot show a range or an uptime figure the product would
 * calculate differently.
 */

import {
  barsForRange,
  overallStatus,
  RANGE_LABEL,
  STATUS_HERO,
  uptimeForRange,
  visibleIncidentEvents,
} from "../src/lib/data.js";
import { disclosure } from "../src/lib/disclosure.js";
import type { RangeKey } from "../src/lib/types.js";
import { createChartView, type ChartView } from "./chart-view.js";
import { createUptimeStrip, type UptimeStrip } from "./uptime-strip.js";
import {
  GENERATED_AT,
  incidentsDocument,
  mockConfig,
  responseTimesDocument,
  statusDocument,
} from "./dummy-data.js";

/** The five ranges, in the order and with the labels the product uses. */
const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "day", label: "24h" },
  { key: "week", label: "7d" },
  { key: "month", label: "30d" },
  { key: "quarter", label: "90d" },
  { key: "year", label: "1yr" },
];

/**
 * Phosphor class for a service, matching what `iconFor` resolves in the product.
 *
 * The mock configuration names short keys, so this maps them onto the curated
 * icons in `site/src/lib/icons.ts`. A service with no icon gets `ph-circle`,
 * which is the documented default.
 */
const ICONS: Record<string, string> = {
  globe: "ph-globe",
  brackets: "ph-brackets-curly",
  cloud: "ph-cloud",
  envelope: "ph-envelope-simple",
  database: "ph-database",
};

/*
 * Built once rather than per render. Both label content that is rebuilt on
 * every range change, and constructing a formatter is what costs.
 */
const EVENT_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});
const UPDATED_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Creates an element with a class and optional text, since there is a lot of this. */
function el<K extends keyof HTMLElementTagNameMap>(
  name: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** A Phosphor glyph, drawn the way the product draws one. */
function icon(name: string, className: string): HTMLElement {
  const element = el("i", `${className} ph-duotone ${name}`);
  element.setAttribute("aria-hidden", "true");
  return element;
}

/** What one service row owns, so a range change can reach into it. */
interface ServiceRow {
  id: string;
  name: string;
  protocols: string;
  open: boolean;
  root: HTMLElement;
  summary: HTMLElement;
  uptime: HTMLElement;
  stripHost: HTMLElement;
  strip: UptimeStrip;
  axisFrom: HTMLElement;
  detailWrap: HTMLElement;
  panel: ReturnType<typeof disclosure>;
  chart: ChartView;
  chartBuilt: boolean;
}

/**
 * Builds the page into a container and wires every control.
 *
 * @param container - Where the page is mounted. It is emptied first.
 * @param layout - `grouped` puts every service in one card, `cards` gives each
 *   its own, matching `VelvetLayout` in `site/src/lib/config.ts`.
 */
export function mountStatusPage(
  container: HTMLElement,
  layout: "grouped" | "cards" = "grouped",
): void {
  container.textContent = "";

  let range: RangeKey = mockConfig.defaultRange;
  const rows: ServiceRow[] = [];

  const page = el("main", "status-page");
  page.dataset.layout = layout;

  /**
   * Wraps a block in a band that spans the window.
   *
   * A theme that fills its navigation or its hero needs that fill to reach both
   * window edges whilst the content inside it stays on the page measure. One
   * element cannot do both, so every block that a theme might fill is built as
   * a pair: the band carries the background and the child carries the width.
   *
   * Themes that fill nothing set the band's background to `transparent`, and
   * the pair then costs one element and nothing else. This was found whilst
   * writing the fourth theme, which is the only one of the four that fills
   * anything, and it is why the markup carries the union of all four designs
   * rather than what the first one happened to need.
   *
   * @param name - Modifier for the band's class, so a theme can address it.
   * @param inner - The block held to the page measure.
   * @returns The band, ready to be appended to the page.
   */
  function band(name: string, inner: HTMLElement): HTMLElement {
    const wrapper = el("div", `status-band status-band--${name}`);
    wrapper.append(inner);
    return wrapper;
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  const nav = el("nav", "status-nav");
  const brand = el("a", "status-brand", mockConfig.name);
  brand.href = "#";
  const links = el("div", "status-nav-links");
  for (const link of mockConfig.navigation) {
    const anchor = el("a", "status-nav-link", link.title);
    anchor.href = link.href;
    links.append(anchor);
  }
  nav.append(brand, links);

  // ── Hero ──────────────────────────────────────────────────────────────────
  const overall = overallStatus(statusDocument.services);
  // The root carries the state, not only the hero, because a design may colour
  // anything by it: one paints the limb around the notices in the state's own
  // colour, and that limb is nowhere near the hero in the tree. It goes on the
  // root because a theme declares its tokens there, and a token declared on the
  // root cannot read a value held below it.
  document.documentElement.dataset.status = overall;
  const hero = el("div", "status-hero");
  const heroMark = el("span", "status-hero-mark");
  heroMark.setAttribute("aria-hidden", "true");
  heroMark.append(icon(STATUS_HERO[overall].icon, "status-hero-glyph"));
  // A filled block between the column and the headline, so a design can run a
  // bar into the words from the left. It says nothing, so it is hidden from
  // anything that reads the page aloud.
  const heroBar = el("span", "status-hero-bar");
  heroBar.setAttribute("aria-hidden", "true");
  const heroTitle = el("h1", "status-hero-title", STATUS_HERO[overall].text);
  const heroUpdated = el(
    "p",
    "status-hero-updated",
    `Last updated ${UPDATED_TIME.format(new Date(GENERATED_AT))}`,
  );
  hero.append(heroMark, heroBar, heroTitle, heroUpdated);

  // ── Notices ───────────────────────────────────────────────────────────────
  const notices = el("section", "notices");
  const visible = visibleIncidentEvents(incidentsDocument.events);
  for (const event of visible.filter((entry) => entry.kind === "maintenance")) {
    const notice = el("div", "notice notice--maintenance");
    notice.append(
      icon("ph-wrench", "notice-glyph"),
      el("span", "notice-title", event.title),
      el("span", "notice-summary", event.summary),
      el(
        "span",
        "notice-meta",
        `${event.state} · ${EVENT_TIME.format(new Date(event.startsAt))}`,
      ),
    );
    notices.append(notice);
  }
  const incidents = visible.filter((entry) => entry.kind === "incident");
  if (incidents.length > 0) {
    notices.append(el("h2", "notices-heading", "Active incidents"));
    for (const event of incidents) {
      const notice = el("div", "notice notice--incident");
      notice.append(
        el("span", "notice-title", event.title),
        el("span", "notice-summary", event.summary),
        el(
          "span",
          "notice-meta",
          `Started ${EVENT_TIME.format(new Date(event.startsAt))}`,
        ),
      );
      notices.append(notice);
    }
  }

  // ── Range bar ─────────────────────────────────────────────────────────────
  const rangeBar = el("div", "range-bar");
  const groupName = el("span", "group-name", mockConfig.name.toUpperCase());
  const rangeButtons = el("div", "ranges");
  /*
    The mark under the selected range, as one element that moves rather than a
    background that appears on whichever button was pressed.

    Moving one element is what makes the change readable: a fill that jumps
    tells you the state changed, whilst a mark that travels tells you where it
    came from. It is animated on `transform` and `width`, and a width animation
    is affordable here because it is one element rather than five.
  */
  const rangeMark = el("span", "range-mark");
  rangeMark.setAttribute("aria-hidden", "true");
  rangeButtons.append(rangeMark);
  const rangeControls = new Map<RangeKey, HTMLButtonElement>();
  for (const option of RANGES) {
    const button = el("button", "range-button", option.label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(option.key === range));
    button.addEventListener("click", () => selectRange(option.key));
    rangeControls.set(option.key, button);
    rangeButtons.append(button);
  }
  const toggleAll = el("button", "toggle-all");
  toggleAll.type = "button";
  toggleAll.append(icon("ph-caret-circle-double-down", "toggle-all-glyph"));
  toggleAll.addEventListener("click", () => {
    const shouldOpen = !rows.every((row) => row.open);
    for (const row of rows) setOpen(row, shouldOpen);
    reflectToggleAll();
  });
  rangeBar.append(groupName, rangeButtons, toggleAll);

  /** Keeps the expand-all control showing what it would do next. */
  function reflectToggleAll(): void {
    const allOpen = rows.length > 0 && rows.every((row) => row.open);
    toggleAll.classList.toggle("is-expanded", allOpen);
    toggleAll.setAttribute("aria-label", allOpen ? "Collapse all" : "Expand all");
    toggleAll.title = allOpen ? "Collapse all" : "Expand all";
  }

  // ── Services ──────────────────────────────────────────────────────────────
  const serviceHost = el("div", "service-list");
  const groupedCard = el("section", "service-card");
  if (layout === "grouped") {
    groupedCard.append(cardOrnament());
    serviceHost.append(groupedCard);
  }

  for (const service of statusDocument.services) {
    const row = el("article", "service");
    row.dataset.serviceId = service.id;

    /*
      The rail segment: this service's name, standing beside everything the row
      shows about it and as tall as all of it.

      One design builds its whole structure this way, and the others hide it and
      keep the name inside the summary button. The markup therefore carries
      both, which is the union rule the contract states: an element cannot be
      moved from inside the button to beside it by any stylesheet.

      It is hidden from assistive technology, because the name it repeats is
      already the button's own label.
    */
    const rail = el("span", "service-rail");
    rail.setAttribute("aria-hidden", "true");
    rail.append(el("span", "service-rail-name", service.name));

    const summary = el("button", "service-summary");
    summary.type = "button";
    const detailsId = `details-${service.id}`;
    summary.setAttribute("aria-controls", detailsId);
    /*
      Labelled explicitly, and with everything the row reports.

      One design moves the name out of the button and into the rail, so a name
      computed from the button's contents would vary by theme. But a label
      carrying only the name would be worse than none: `aria-label` replaces
      the contents rather than adding to them, so the uptime figure and the
      protocols would stop being announced. The label therefore carries all
      three, and `refresh` rewrites it whenever the range changes the figure.
    */
    summary.append(
      icon(ICONS[mockConfig.icons[service.id] ?? ""] ?? "ph-circle", "service-icon"),
      el("span", "service-name", service.name),
    );
    // The badges appear only where there is something to distinguish, which is
    // what `ServiceSummary.svelte` does: one IPv4 check needs no label.
    if (service.checks.length > 1 || service.checks[0]?.protocol === "ipv6") {
      const badges = el("span", "service-protocols");
      badges.setAttribute("aria-label", "Protocol reachability");
      for (const check of service.checks) {
        const badge = el(
          "span",
          "protocol-badge",
          check.protocol === "ipv4" ? "IPv4" : "IPv6",
        );
        badge.dataset.protocol = check.protocol;
        badge.dataset.status = check.status;
        badges.append(badge);
      }
      summary.append(badges);
    }
    const uptime = el("span", "service-uptime");
    summary.append(uptime, icon("ph-caret-circle-down", "service-chevron"));

    const stripHost = el("div", "uptime-strip-host");
    const axis = el("div", "strip-axis");
    const axisFrom = el("span", "strip-axis-from");
    axis.append(axisFrom, el("span", "strip-axis-to", "Today"));

    const detailWrap = el("div", "service-details-wrap");
    detailWrap.id = detailsId;
    const details = el("div", "service-details");
    const readings = el("div", "protocol-readings");
    readings.setAttribute("role", "list");
    readings.setAttribute("aria-label", "Protocol status");
    service.checks.forEach((check, index) => {
      if (index > 0) {
        const separator = el("span", "protocol-separator", "|");
        separator.setAttribute("aria-hidden", "true");
        readings.append(separator);
      }
      const reading = el("div", "protocol-reading");
      reading.setAttribute("role", "listitem");
      reading.dataset.protocol = check.protocol;
      reading.dataset.status = check.status;
      reading.append(
        el(
          "span",
          "protocol-name",
          check.protocol === "ipv4" ? "IPv4" : "IPv6",
        ),
      );
      const value = el("span", "protocol-value");
      value.append(
        el("strong", "protocol-state", check.status === "operational" ? "up" : check.status),
        el(
          "span",
          "protocol-latency",
          check.responseTimeMs === null
            ? "unavailable"
            : `${Math.round(check.responseTimeMs)} ms`,
        ),
      );
      reading.append(value);
      readings.append(reading);
    });
    const chartHost = el("div", "chart-host");
    details.append(readings, chartHost);
    detailWrap.append(details);

    row.append(rail, summary, stripHost, axis, detailWrap);
    (layout === "grouped" ? groupedCard : serviceHost).append(
      layout === "grouped" ? row : wrapInCard(row),
    );

    const entry: ServiceRow = {
      id: service.id,
      name: service.name,
      protocols: "",
      open: false,
      root: row,
      summary,
      uptime,
      stripHost,
      strip: createUptimeStrip(stripHost),
      axisFrom,
      detailWrap,
      panel: disclosure(detailWrap, false),
      chart: createChartView(chartHost, service.id, service.name, GENERATED_AT),
      chartBuilt: false,
    };
    rows.push(entry);
    entry.protocols = service.checks
      .map((check) => (check.protocol === "ipv4" ? "IPv4" : "IPv6"))
      .join(" and ");
    summary.addEventListener("click", () => {
      setOpen(entry, !entry.open);
      reflectToggleAll();
    });
    row.dataset.open = "false";
    summary.setAttribute("aria-expanded", "false");
  }

  /** Gives a service its own card, which is what the `cards` layout does. */
  function wrapInCard(row: HTMLElement): HTMLElement {
    const card = el("section", "service-card");
    card.append(cardOrnament(), row);
    return card;
  }

  /**
   * An empty element every card carries, for whatever a theme draws on it.
   *
   * Five of the seven themes hide it. The two that do not use it for corner
   * brackets and edge scales, which are backgrounds rather than content and so
   * need a surface of their own: the card's `::before` is the rail and its
   * `::after` is the masked edge, and both are already spoken for.
   *
   * It carries no text and is hidden from assistive technology, because
   * everything it draws is decoration. A theme that needed it to say something
   * would be a theme putting meaning into decoration.
   */
  function cardOrnament(): HTMLElement {
    const ornament = el("span", "card-ornament");
    ornament.setAttribute("aria-hidden", "true");
    return ornament;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = el("footer", "status-footer");
  const powered = el("div", "powered");
  powered.append(
    el("span", "powered-label", "powered by"),
    el("span", "velvet-wordmark", "Velvet"),
  );
  const configured = el("p", "configured");
  configured.append(document.createTextNode("Configured by its operator at "));
  const configuredLink = el("a", "", "setup.velvet.li/configurator");
  configuredLink.href = "https://setup.velvet.li/configurator/";
  configuredLink.rel = "noopener noreferrer";
  configuredLink.target = "_blank";
  configured.append(configuredLink);
  footer.append(powered, configured);

  const build = el("p", "stamp stamp--build", `v${mockConfig.version}`);
  const serial = el(
    "p",
    "stamp stamp--serial",
    `Serial #${String(mockConfig.serial).padStart(5, "0")}`,
  );

  const body = el("div", "status-body");
  body.append(notices, rangeBar, serviceHost);
  page.append(
    band("nav", nav),
    band("hero", hero),
    band("body", body),
    band("footer", footer),
    build,
    serial,
  );
  container.append(page);

  /**
   * Opens or closes one service.
   *
   * The chart is built the first time a service is opened rather than with the
   * page. Five services with two protocols each is ten charts nobody has asked
   * to see, and the arithmetic behind one is a filter over roughly 1 200
   * samples followed by a downsample.
   */
  function setOpen(row: ServiceRow, open: boolean): void {
    if (row.open === open) return;
    row.open = open;
    row.root.dataset.open = String(open);
    row.summary.setAttribute("aria-expanded", String(open));
    if (open && !row.chartBuilt) {
      row.chart.update(
        responseTimesDocument.series.filter(
          ({ serviceId }) => serviceId === row.id,
        ),
        range,
      );
      row.chartBuilt = true;
    }
    row.panel.update(open);
  }

  /**
   * Puts the mark under the selected range.
   *
   * Measured rather than calculated from the labels, because the buttons are
   * as wide as their type and that depends on the theme's face and tracking.
   *
   * @param animate - False on the first placement, so the mark does not slide
   *   in from the left edge when the page opens.
   */
  function placeRangeMark(animate: boolean): void {
    const button = rangeControls.get(range);
    if (!button) return;
    const track = rangeButtons.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    if (track.width === 0) return;
    rangeMark.style.transition = animate ? "" : "none";
    rangeMark.style.width = `${box.width}px`;
    rangeMark.style.transform = `translateX(${box.left - track.left}px)`;
    if (!animate) {
      // Forces the browser to take the un-animated position before the
      // transition is handed back, so the next change animates from here.
      void rangeMark.offsetWidth;
      rangeMark.style.transition = "";
    }
  }

  /** Switches the range and refreshes everything that depends on it. */
  function selectRange(next: RangeKey): void {
    range = next;
    for (const [key, button] of rangeControls) {
      button.setAttribute("aria-pressed", String(key === next));
    }
    placeRangeMark(true);
    refresh();
  }

  /** Redraws every service for the current range. */
  function refresh(): void {
    for (const row of rows) {
      const service = statusDocument.services.find(({ id }) => id === row.id);
      if (!service) continue;
      const uptime = uptimeForRange(
        service,
        range,
        statusDocument.generatedAt,
        statusDocument.monitoringStartedAt,
      );
      row.uptime.textContent = `${uptime} uptime`;
      // Rewritten with the figure, because the label replaces the contents and
      // the figure is half of what the row says.
      row.summary.setAttribute(
        "aria-label",
        [row.name, `${uptime} uptime`, row.protocols].filter(Boolean).join(", "),
      );
      row.strip.update(
        barsForRange(
          service,
          range,
          statusDocument.generatedAt,
          statusDocument.monitoringStartedAt,
          incidentsDocument.events,
        ),
        range,
      );
      row.axisFrom.textContent = RANGE_LABEL[range];
      if (row.chartBuilt) {
        row.chart.update(
          responseTimesDocument.series.filter(
            ({ serviceId }) => serviceId === row.id,
          ),
          range,
        );
      }
    }
  }

  reflectToggleAll();
  refresh();
  placeRangeMark(false);
  // The buttons are as wide as their type, so a face arriving late or a window
  // resize moves them and the mark follows.
  new ResizeObserver(() => placeRangeMark(false)).observe(rangeButtons);
  document.fonts?.ready.then(() => placeRangeMark(false));
}
