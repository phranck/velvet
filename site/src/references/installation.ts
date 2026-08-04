/**
 * What the gallery knows about one installation, and how it finds it out.
 *
 * The setup service discloses a name and an address and nothing else, which is
 * the whole of what an owner agreed to. Everything a card shows beyond that is
 * published by the installation itself, to anybody, and is read straight from
 * it by the browser: its colours, what its services are doing, and since when.
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

/** How a status page is doing, in the terms its own theme uses. */
export type InstallationState = "operational" | "degraded" | "outage" | "unknown";

/** One entry of the gallery, ready to render. */
export interface Installation extends Reference {
  /** Address without its scheme, which is what a reader reads. */
  host: string;
  /** The social card the status page publishes, used as its preview. */
  previewUrl: string;
  /** Worst state across every service the page watches. */
  state: InstallationState;
  /** The colour that state is drawn in, taken from the page's own theme. */
  stateColour: string;
  /** How many services the page watches. */
  services: number;
  /** When monitoring began, as an ISO timestamp, or `null` when unknown. */
  startedAt: string | null;
}

/** Colours a status page draws its states in, with Velvet's own as fallbacks. */
const FALLBACK_COLOURS: Record<InstallationState, string> = {
  operational: "#8ca5ff",
  degraded: "#d29922",
  outage: "#f85149",
  unknown: "#3a3d4a",
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
  theme?: { accent?: unknown; grid?: Record<string, unknown> };
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

function colour(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value)
    ? value
    : fallback;
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
 * Two documents are read, and both have to answer. `config.json` says where the
 * data lives and which colours the page draws its states in; the snapshot says
 * what those states are. An installation that answers neither is one whose page
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
  const grid = isRecord(page.theme?.grid) ? page.theme.grid : {};
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
    stateColour: colour(
      state === "unknown" ? grid.noData : grid[state],
      state === "operational"
        ? colour(page.theme?.accent, FALLBACK_COLOURS.operational)
        : FALLBACK_COLOURS[state],
    ),
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

/**
 * Says when monitoring began and how long ago that was.
 *
 * The span is rounded to the largest unit that still says something, because
 * "watching for 412 days" is arithmetic left to the reader whilst "over a year"
 * is the sentence they wanted. A page set up today gets the date alone, since
 * "0 days" says less than nothing.
 *
 * @param startedAt - ISO timestamp monitoring began at.
 * @param now - The moment to measure against, injectable so a test is not
 *   dated.
 * @returns The sentence for the card, or `null` when the date is unusable.
 */
export function watchingSince(startedAt: string | null, now = new Date()): string | null {
  if (!startedAt) return null;
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return null;

  const date = started.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const days = Math.floor((now.getTime() - started.getTime()) / 86_400_000);
  if (days < 1) return `Watching since ${date}`;

  const years = Math.floor(days / 365);
  const span =
    years >= 2
      ? `${years} years`
      : days >= 365
        ? "over a year"
        : days >= 60
          ? `${Math.floor(days / 30)} months`
          : days === 1
            ? "a day"
            : `${days} days`;
  return `Watching since ${date}, ${span}`;
}
