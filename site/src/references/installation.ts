/**
 * What the gallery knows about one installation, and how it finds it out.
 *
 * The setup service discloses a name and an address and nothing else, which is
 * the whole of what an owner agreed to. Everything a card shows beyond that is
 * published by the installation itself, to anybody, and is read straight from
 * it by the browser: what its services are doing, and since when.
 *
 * Reading it here rather than through the service keeps that boundary intact.
 * It also keeps the service from making requests to addresses its own users
 * choose, since an installation may name a custom domain.
 */

/** What the setup service discloses about a consenting installation. */
export interface Reference {
  statusPageName: string;
  url: string;
}

/** How a status page is doing, worst service first. */
export type InstallationState = "operational" | "degraded" | "outage" | "unknown";

/** One entry of the gallery, ready to render. */
export interface Installation extends Reference {
  /** Address without its scheme, which is what a reader reads. */
  host: string;
  /** The social card the status page publishes, used as its preview. */
  previewUrl: string;
  /** Worst state across every service the page watches. */
  state: InstallationState;
  /** How many services the page watches. */
  services: number;
  /** When monitoring began, as an ISO timestamp, or `null` when unknown. */
  startedAt: string | null;
}

/**
 * The token each state is drawn from across the gallery.
 *
 * A name rather than a colour, so the colour itself is stated once in
 * `velvet-tokens.css` beside the other three and a change reaches the status
 * page, the tools, and this gallery together.
 *
 * One set for every card rather than each installation's own, because the page
 * carries a legend and a legend only means something whilst the same colour
 * means the same thing on every card beneath it. An installation's own palette
 * belongs to its own page, where it is the only one on screen.
 */
export const STATE_TOKENS: Record<InstallationState, string> = {
  operational: "--velvet-operational",
  degraded: "--velvet-degraded",
  outage: "--velvet-outage",
  unknown: "--velvet-no-data",
};

/** How long a single request may take before the installation counts as gone. */
const TIMEOUT_MS = 8_000;

interface ServiceSnapshot {
  status?: unknown;
}

interface StatusSnapshot {
  monitoringStartedAt?: unknown;
  services?: ServiceSnapshot[];
}

interface PageConfiguration {
  dataBaseUrl?: unknown;
}

/**
 * Reads a JSON document from another origin.
 *
 * @param url - Absolute address of the document.
 * @param signal - Aborts the request when the page navigates away.
 * @returns The parsed document, or `null` when it could not be had for any
 *   reason. A caller cannot act differently on a 404 than on a timeout, since
 *   both mean the same thing here: nothing to show.
 */
async function readJson(
  url: string,
  signal?: AbortSignal,
): Promise<unknown | null> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    return response.ok ? ((await response.json()) as unknown) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reduces every service's state to the one the page is in.
 *
 * The worst wins, because a page with one endpoint down is not operational
 * however many others are up.
 */
function worstState(services: ServiceSnapshot[]): InstallationState {
  if (services.length === 0) return "unknown";
  if (services.some((service) => service.status === "outage")) return "outage";
  if (services.some((service) => service.status === "degraded")) return "degraded";
  return services.every((service) => service.status === "operational")
    ? "operational"
    : "unknown";
}

/**
 * Asks one installation about itself.
 *
 * Two documents are read. `config.json` says where the data lives, and the
 * snapshot says what the services are doing. An installation that answers
 * neither is one whose page
 * a visitor could not open either, so it is left out rather than shown as a card
 * that leads nowhere.
 *
 * @param reference - Name and address, as the setup service disclosed them.
 * @param signal - Aborts both requests when the page navigates away.
 * @returns The entry to render, or `null` when the installation cannot be read.
 */
export async function describeInstallation(
  reference: Reference,
  signal?: AbortSignal,
): Promise<Installation | null> {
  const base = new URL(reference.url);
  const configuration = await readJson(new URL("config.json", base).href, signal);
  if (!isRecord(configuration)) return null;

  const page = configuration as PageConfiguration;
  const snapshot =
    typeof page.dataBaseUrl === "string"
      ? await readJson(`${page.dataBaseUrl}/status.json`, signal)
      : null;

  const status = isRecord(snapshot) ? (snapshot as StatusSnapshot) : null;
  const services = Array.isArray(status?.services) ? status.services : [];
  const state = worstState(services);

  return {
    ...reference,
    host: reference.url.replace(/^https?:\/\//u, "").replace(/\/$/u, ""),
    previewUrl: new URL("og.png", base).href,
    state,
    services: services.length,
    startedAt:
      typeof status?.monitoringStartedAt === "string"
        ? status.monitoringStartedAt
        : null,
  };
}

/** What a card says about the state, beside the dot that repeats it. */
export function stateLabel(state: InstallationState): string {
  return {
    operational: "All operational",
    degraded: "Degraded",
    outage: "Outage",
    unknown: "No data yet",
  }[state];
}

/** Parses a timestamp, or gives nothing when it cannot be read as a date. */
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The day a status page went live, as digits.
 *
 * Digits rather than a written month, because this sits in a chip beside three
 * other facts and is scanned rather than read.
 *
 * @param startedAt - ISO timestamp monitoring began at.
 * @returns `DD.MM.YYYY`, or `null` when the date is unusable.
 */
export function releaseDate(startedAt: string | null): string | null {
  const started = parseDate(startedAt);
  if (!started) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(started.getDate())}.${pad(started.getMonth() + 1)}.${started.getFullYear()}`;
}

/**
 * How long a status page has been running, in whole days.
 *
 * One unit, because the chip is compared against the same chip on the card
 * beside it and days sort where "3 months" does not. The breakdown is a hover
 * away for anybody who wants it.
 *
 * @param startedAt - ISO timestamp monitoring began at.
 * @param now - The moment to measure against, injectable so a test is not dated.
 * @returns Something like `213 days`, or `null` when the date is unusable.
 */
export function uptimeDays(startedAt: string | null, now = new Date()): string | null {
  const started = parseDate(startedAt);
  if (!started) return null;
  const days = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 86_400_000));
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The same span written out, for the hover.
 *
 * Years, months, weeks, and days, dropping every unit that is zero so a page
 * three days old says "3 days" rather than "0 years, 0 months, 0 weeks,
 * 3 days". Months are counted by the calendar rather than as thirty-day blocks,
 * because a reader checks this against a date they remember.
 *
 * @param startedAt - ISO timestamp monitoring began at.
 * @param now - The moment to measure against.
 * @returns Something like `1 year, 3 months, 2 weeks, 4 days`, or `null`.
 */
export function uptimeBreakdown(
  startedAt: string | null,
  now = new Date(),
): string | null {
  const started = parseDate(startedAt);
  if (!started || started.getTime() > now.getTime()) return null;

  let years = now.getFullYear() - started.getFullYear();
  let months = now.getMonth() - started.getMonth();
  let days = now.getDate() - started.getDate();
  if (now.getHours() < started.getHours()) days -= 1;
  if (days < 0) {
    months -= 1;
    // The length of the month that has just been borrowed from, which is what
    // makes this a calendar count rather than an approximation.
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const weeks = Math.floor(days / 7);
  days -= weeks * 7;

  const parts = [
    [years, "year"],
    [months, "month"],
    [weeks, "week"],
    [days, "day"],
  ] as const;
  const written = parts
    .filter(([amount]) => amount > 0)
    .map(([amount, unit]) => `${amount} ${unit}${amount === 1 ? "" : "s"}`);
  return written.length > 0 ? written.join(", ") : "less than a day";
}
