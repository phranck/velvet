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
import { disclosure } from "@velvet/bundle-plugins/disclosure";
import type { RangeKey, ServiceStatus } from "../src/lib/types.js";
import {
  createChartView,
  type ChartView,
} from "@velvet/bundle-plugins/response-chart";
import { createOverlay } from "@velvet/bundle-plugins/overlay";
import {
  createUptimeStrip,
  type UptimeStrip,
} from "@velvet/bundle-plugins/uptime-strip";
import { readChartTokens, readStripTokens } from "./read-tokens.js";
import {
  GENERATED_AT,
  incidentsDocument,
  mockConfig,
  responseTimesDocument,
  statusDocument,
} from "./dummy-data.js";

/**
 * The five ranges, in the order and with the labels the product uses.
 *
 * Each carries a sentence as well, because "90d" on its own says how long but
 * not what it covers. It is the button's accessible name and the text of its
 * overlay, so what is read aloud and what is shown on hover are the same words.
 */
const RANGES: Array<{ key: RangeKey; label: string; description: string }> = [
  { key: "day", label: "24h", description: "The last 24 hours" },
  { key: "week", label: "7d", description: "The last 7 days" },
  { key: "month", label: "30d", description: "The last 30 days" },
  { key: "quarter", label: "90d", description: "The last 90 days" },
  { key: "year", label: "1yr", description: "The last 12 months" },
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

/**
 * A date as `24.03.2026`.
 *
 * Written out rather than formatted by locale, because the panel's own reading
 * of a date is fixed: two digits, two digits, four digits, separated by stops.
 * A locale would give a different order and a different separator depending on
 * who is looking.
 *
 * @param moment - The date to write.
 * @returns The date, zero-padded.
 */
function panelDate(moment: Date): string {
  const day = String(moment.getUTCDate()).padStart(2, "0");
  const month = String(moment.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${moment.getUTCFullYear()}`;
}



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

/**
 * Whether the design reads on a display of its own rather than in an overlay.
 *
 * Read once, from the root, because a mockup page carries one theme for its
 * whole life and this decides how every row is wired.
 */
const READS_ON_DISPLAY =
  getComputedStyle(document.documentElement)
    .getPropertyValue("--service-display-display")
    .trim() !== "contents";

/** What a service's own state is called on that display. */
const STATE_WORD: Record<ServiceStatus, string> = {
  operational: "Operational",
  degraded: "Degraded",
  outage: "Outage",
  maintenance: "Maintenance",
  unknown: "No data",
};

/**
 * The mark a design without icons uses where another design puts a chevron.
 *
 * It carries no text of its own. `base.css` states the two characters, because
 * which character says "this opens" is a design decision rather than a fact
 * about the row, and a theme that draws a chevron leaves the element
 * undisplayed. Hidden from assistive technology, since the button around it
 * already says what it does.
 *
 * @returns The mark, ready to be put in a control beside its glyph.
 */
function disclosureMark(): HTMLElement {
  const mark = el("span", "disclosure-mark");
  mark.setAttribute("aria-hidden", "true");
  return mark;
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
  status: ServiceStatus;
  displayMain: HTMLElement;
  displaySecond: HTMLElement;
  stripHost: HTMLElement;
  strip: UptimeStrip;
  axisFrom: HTMLElement;
  detailWrap: HTMLElement;
  panel: ReturnType<typeof disclosure>;
  chart: ChartView;
  chartBuilt: boolean;
}

/**
 * Shows the page as though the installation were in a given state.
 *
 * A mockup renders from one fixture, so on its own it would only ever show the
 * one headline that fixture produces. A theme may colour a great deal by the
 * state, and none of that can be reviewed without seeing the other three.
 *
 * It changes what the page announces and nothing behind it: the services, the
 * strips and the charts go on reporting what the fixture says.
 *
 * @param status - The state to announce.
 */
export function previewOverallStatus(status: ServiceStatus): void {
  document.documentElement.dataset.status = status;
  const title = document.querySelector(".status-hero-title");
  if (title) title.textContent = STATUS_HERO[status].text;
  const glyph = document.querySelector(".status-hero-glyph");
  if (glyph) {
    glyph.className = `status-hero-glyph ph-duotone ${STATUS_HERO[status].icon}`;
  }
  // Nothing is wrong, so nothing is being reported. A page announcing that
  // every service is up whilst listing an open incident contradicts itself.
  const notices = document.querySelector(".notices");
  const quiet = status === "operational" || !notices?.hasChildNodes();
  document.documentElement.dataset.notices = quiet ? "none" : "some";
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
  /*
    The installation's own name, and nothing beside it.

    A published page carries a bar with the operator's name or logo in it and no
    links: `StatusPage.svelte` drops the one entry the default configuration
    holds, because its address is the page itself, and an installation adds
    others only by hand. `base.css` goes on styling those, so a theme covers
    them where an operator has written some, but a mockup that invented three
    would be showing a page nobody has.
  */
  const nav = el("nav", "status-nav");
  const brand = el("a", "status-brand", mockConfig.name);
  brand.href = "#";
  nav.append(brand);

  // ── Hero ──────────────────────────────────────────────────────────────────
  const overall = overallStatus(statusDocument.services);
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
  /*
    Every notice reports its own height as a custom property, so a theme can
    round one end into a capsule without flattening the other.

    A capsule is half the box's height, and CSS has no way to say that: a
    percentage in a `border-radius` resolves against the box's own axis, so 50%
    on the horizontal component gives half the width. Writing a number large
    enough to always exceed it does not work either, because where two radii
    along one edge overrun it the browser scales every corner of the box by the
    same factor. Measured on a 112px notice with a 999px capsule at its trailing
    end: the factor came out at 0.056, and the 10px leading corners were drawn
    at 0.56px.
  */
  const capObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const element = entry.target as HTMLElement;
      // Only where the theme asks for one. Every other design wants its own
      // corner at that end and would be given a capsule it never asked for.
      const wanted =
        getComputedStyle(element).getPropertyValue("--notice-trailing").trim() ===
        "capsule";
      if (!wanted) {
        element.style.removeProperty("--notice-cap");
        continue;
      }
      element.style.setProperty(
        "--notice-cap",
        `${element.getBoundingClientRect().height / 2}px`,
      );
    }
  });
  // A design may hold each notice to a single line and cut the rest off, so the
  // whole of it is available on hover and on focus. On the document's own
  // layer, for the reason `overlay.ts` sets out.
  const noticeTip = createOverlay("uptime-tooltip");
  /**
   * Shows a notice's full text whilst it is hovered or focused.
   *
   * @param notice - The row to attach to.
   * @param text - Everything the row says, however much of it is drawn.
   */
  function tellInFull(notice: HTMLElement, text: string): void {
    /**
     * Whether anything in the row is being cut off.
     *
     * Read at the moment it is asked rather than once at build time, because
     * whether a line fits depends on the width the window happens to have.
     *
     * @returns True where a cell is drawing less than it holds.
     */
    const clipped = (): boolean =>
      [...notice.children].some((cell) => {
        const box = cell as HTMLElement;
        return (
          box.scrollWidth > box.clientWidth + 1 ||
          box.scrollHeight > box.clientHeight + 1
        );
      });
    // Focusable only whilst there is something a pointer could not reach, since
    // a stop on the way through the page that says nothing is a stop wasted.
    const reflectFocusable = (): void => {
      if (clipped()) notice.tabIndex = 0;
      else notice.removeAttribute("tabindex");
    };
    reflectFocusable();
    new ResizeObserver(reflectFocusable).observe(notice);
    // Again once the faces have arrived. A row measured before the face loads
    // is measured in whatever the browser put there meanwhile, which can
    // overflow where the real one fits, and the row's own box does not change
    // when the swap happens, so nothing else would ask again.
    void document.fonts.ready.then(reflectFocusable);
    const show = (): void => {
      // Nothing to add where the row already shows all of it.
      if (!clipped()) return;
      noticeTip.show(text, () => ({
        rect: notice.getBoundingClientRect(),
        side: "below",
      }));
    };
    notice.addEventListener("pointerenter", show);
    notice.addEventListener("focus", show);
    notice.addEventListener("pointerleave", () => noticeTip.hide());
    notice.addEventListener("blur", () => noticeTip.hide());
  }
  const visible = visibleIncidentEvents(incidentsDocument.events);
  for (const event of visible.filter((entry) => entry.kind === "maintenance")) {
    const notice = el("div", "notice notice--maintenance");
    const starts = new Date(event.startsAt);
    notice.append(
      icon("ph-wrench", "notice-glyph"),
      el("span", "notice-date", panelDate(starts)),
      el("span", "notice-title", event.title),
      el("span", "notice-summary", event.summary),
      el(
        "span",
        "notice-meta",
        `${event.state} · ${EVENT_TIME.format(starts)}`,
      ),
    );
    capObserver.observe(notice);
    tellInFull(notice, `${event.title}. ${event.summary}`);
    notices.append(notice);
  }
  const incidents = visible.filter((entry) => entry.kind === "incident");
  if (incidents.length > 0) {
    notices.append(el("h2", "notices-heading", "Active incidents"));
    for (const event of incidents) {
      const notice = el("div", "notice notice--incident");
      const began = new Date(event.startsAt);
      notice.append(
        el("span", "notice-date", panelDate(began)),
        el("span", "notice-title", event.title),
        el("span", "notice-summary", event.summary),
        el("span", "notice-meta", `Started ${EVENT_TIME.format(began)}`),
      );
      capObserver.observe(notice);
      tellInFull(notice, `${event.title}. ${event.summary}`);
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
  // On the document's own layer rather than inside the bar, for the reason
  // `overlay.ts` sets out: a clipping ancestor cuts an overlay however it is
  // positioned.
  const rangeTip = createOverlay("uptime-tooltip");
  for (const option of RANGES) {
    const button = el("button", "range-button", option.label);
    button.type = "button";
    button.setAttribute("aria-pressed", String(option.key === range));
    // The sentence rather than the abbreviation, since "90d" says how long but
    // not what it covers.
    button.setAttribute("aria-label", option.description);
    button.addEventListener("click", () => selectRange(option.key));
    // Shown on focus as well as on hover, so a keyboard reaches it too.
    const show = (): void =>
      rangeTip.show(option.description, () => ({
        rect: button.getBoundingClientRect(),
        side: "below",
      }));
    button.addEventListener("pointerenter", show);
    button.addEventListener("focus", show);
    button.addEventListener("pointerleave", () => rangeTip.hide());
    button.addEventListener("blur", () => rangeTip.hide());
    rangeControls.set(option.key, button);
    rangeButtons.append(button);
  }
  const toggleAll = el("button", "toggle-all");
  toggleAll.type = "button";
  toggleAll.append(
    icon("ph-caret-circle-double-down", "toggle-all-glyph"),
    disclosureMark(),
  );
  toggleAll.addEventListener("click", () => {
    const shouldOpen = !rows.every((row) => row.open);
    for (const row of rows) setOpen(row, shouldOpen);
    reflectToggleAll();
  });
  rangeBar.append(groupName, rangeButtons, toggleAll);

  /**
   * Puts a reading on a row's display, or restores what it says at rest.
   *
   * One line each. At rest the display names the service's own state and the
   * window it is reporting on, which is what a machine of this kind shows when
   * nobody is touching it.
   *
   * @param row - The row whose display is being written.
   * @param lines - The reading, one string per line, or `null` for at rest.
   */
  function readOut(row: ServiceRow, lines: string[] | null): void {
    if (!lines || lines.length === 0) {
      row.displayMain.textContent = STATE_WORD[row.status];
      row.displaySecond.textContent =
        RANGES.find((option) => option.key === range)?.description ?? "";
      return;
    }
    row.displayMain.textContent = lines[0] ?? "";
    row.displaySecond.textContent = lines.slice(1).join("   ");
  }

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
    /*
      Both protocols, always, with each marked as measured or not.

      `ServiceSummary.svelte` shows a badge only where there is something to
      distinguish, and a design may keep that: it hides whatever is marked
      absent, and hides the pair entirely where a service has one IPv4 check
      and nothing to compare it with. One design instead draws the pair as two
      lamps and lights whichever protocol was actually measured, which needs
      both in the markup whatever the service has.
    */
    const badges = el("span", "service-protocols");
    badges.setAttribute("aria-label", "Protocol reachability");
    badges.dataset.single = String(
      service.checks.length === 1 && service.checks[0]?.protocol === "ipv4",
    );
    for (const protocol of ["ipv4", "ipv6"] as const) {
      const check = service.checks.find((entry) => entry.protocol === protocol);
      const badge = el(
        "span",
        "protocol-badge",
        protocol === "ipv4" ? "IPv4" : "IPv6",
      );
      badge.dataset.protocol = protocol;
      badge.dataset.present = String(Boolean(check));
      if (check) badge.dataset.status = check.status;
      badges.append(badge);
    }
    summary.append(badges);
    /*
      Two lines a design may read on, with the uptime figure at the end of the
      first. Where a design has no such display, both the element and its lines
      are `display: contents`, so the figure is a child of the row again and
      the row is laid out exactly as it was before this existed.
    */
    const uptime = el("span", "service-uptime");
    const displayMain = el("span", "service-display-main");
    const displaySecond = el("span", "service-display-line");
    const displayFirst = el("span", "service-display-line");
    displayFirst.append(displayMain, uptime);
    const display = el("span", "service-display");
    display.append(displayFirst, displaySecond);
    summary.append(
      display,
      icon("ph-caret-circle-down", "service-chevron"),
      disclosureMark(),
    );

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
      status: service.status,
      displayMain,
      displaySecond,
      stripHost,
      /*
        The plugins take their appearance from the design that uses them. Whilst
        the mockups still run on the shared token set, that appearance is the
        token set read back, so a theme file keeps deciding the shape of a
        segment exactly as it did before the drawing became a plugin.
      */
      strip: createUptimeStrip(stripHost, {
        style: () => readStripTokens(stripHost),
        heightProperty: "--strip-surface-height",
        report: READS_ON_DISPLAY ? (lines) => readOut(entry, lines) : undefined,
      }),
      axisFrom,
      detailWrap,
      panel: disclosure(detailWrap, false),
      chart: createChartView(chartHost, service.id, service.name, GENERATED_AT, {
        style: () => readChartTokens(chartHost),
        tooltipClassName: "uptime-tooltip chart-reading",
        seriesColours: () => {
          const inherited = getComputedStyle(chartHost);
          return {
            ipv4: inherited.getPropertyValue("--series-own").trim(),
            ipv6: inherited.getPropertyValue("--series-next").trim(),
          };
        },
        report: READS_ON_DISPLAY ? (lines) => readOut(entry, lines) : undefined,
      }),
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
  const build = el("p", "stamp stamp--build", `v${mockConfig.version}`);
  const serial = el(
    "p",
    "stamp stamp--serial",
    `Serial #${String(mockConfig.serial).padStart(5, "0")}`,
  );

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
  /*
    The version, the credit line and the serial share one row, so all three sit
    on one baseline. They used to be fixed to the window's corners whilst the
    credit sat in the flow, which put them on different lines by however tall
    the footer happened to be.
  */
  const footerRow = el("div", "status-footer-row");
  footerRow.append(build, configured, serial);
  footer.append(powered, footerRow);

  /*
    Tracks the credit's label out until it ends where the wordmark ends.
    Measured rather than stated, because the two lines are set in different
    faces at different sizes and only the browser knows what either comes to.
  */
  function fitPoweredLabel(): void {
    const mark = powered.querySelector<HTMLElement>(".velvet-wordmark");
    const label = powered.querySelector<HTMLElement>(".powered-label");
    if (!mark || !label) return;
    label.style.removeProperty("--powered-label-tracking");
    const natural = label.getBoundingClientRect().width;
    const target = mark.getBoundingClientRect().width;
    const gaps = (label.textContent ?? "").length - 1;
    if (gaps <= 0 || natural <= 0 || target <= natural) return;
    label.style.setProperty(
      "--powered-label-tracking",
      `${(target - natural) / gaps}px`,
    );
  }
  new ResizeObserver(fitPoweredLabel).observe(powered);
  void document.fonts.ready.then(fitPoweredLabel);


  const body = el("div", "status-body");
  // The foot of the limb the range bar opens: a design that draws one closes it
  // here, and every other leaves it undisplayed.
  const serviceFoot = el("div", "service-foot");
  // The arm can carry the version and the serial, which is why it is not hidden
  // from a reader who hears the page. What it draws besides those two is
  // decoration. A design that shows them here hides the footer's own pair, so
  // the page states each figure once.
  serviceFoot.append(
    el("span", "service-foot-version", `v${mockConfig.version}`),
    el(
      "span",
      "service-foot-serial",
      `Serial #${String(mockConfig.serial).padStart(5, "0")}`,
    ),
  );
  serviceHost.append(serviceFoot);

  body.append(notices, rangeBar, serviceHost);
  page.append(
    band("nav", nav),
    band("hero", hero),
    band("body", body),
    band("footer", footer),
  );
  container.append(page);
  // The state goes on the root, where a theme can read it, because a theme
  // declares its tokens on `:root` and a token declared there cannot read a
  // value held below it. One design paints the limb around the notices in this
  // colour, and that limb is nowhere near the hero in the tree.
  previewOverallStatus(overall);

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
   * The layout box is what is read, and the theme's scale for the chosen label
   * is applied to it here. A theme may draw that label larger through a
   * `transform`, which leaves the box alone by design, so the mark has to be
   * widened by the same factor for the gap to be the size of what stands in
   * it. Reading the rendered rectangle instead would give whatever size the
   * label happened to be passing through mid-transition.
   *
   * @param animate - False on the first placement, so the mark does not slide
   *   in from the left edge when the page opens.
   */
  function placeRangeMark(animate: boolean): void {
    const button = rangeControls.get(range);
    if (!button) return;
    const track = rangeButtons.getBoundingClientRect();
    if (track.width === 0) return;
    const style = getComputedStyle(button);
    const scale =
      Number.parseFloat(style.getPropertyValue("--control-active-scale")) || 1;
    // Taken off each side, because a label's own padding is scaled up with it
    // and a theme may not want all of that as empty bar around the words.
    const trim =
      Number.parseFloat(style.getPropertyValue("--range-mark-trim")) || 0;
    const width = button.offsetWidth * scale - 2 * trim;
    const left = button.offsetLeft - (width - button.offsetWidth) / 2;
    rangeMark.style.transition = animate ? "" : "none";
    rangeMark.style.width = `${width}px`;
    rangeMark.style.transform = `translateX(${left}px)`;
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
      // The display names the window it is reporting on, so a range change
      // rewrites what it says at rest.
      readOut(row, null);
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
