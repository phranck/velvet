import type { DayStatus, Incident, RangeKey, ServiceStatus, ServiceSummary } from "./types";

/** Minutes in a day — used to grade per-day downtime severity for the bar. */
const MINUTES_PER_DAY = 1440;
/** Below this share of a day down, a day reads as degraded rather than down. */
const DOWN_DAY_THRESHOLD = 0.3;

/**
 * Per-range rendering spec: how many trailing days the bar covers and how many
 * days each segment aggregates (>1 buckets days into weekly bars). History is
 * capped at one year.
 */
interface RangeSpec {
  days: number;
  bucketDays: number;
}
const RANGE_SPECS: Record<RangeKey, RangeSpec> = {
  day: { days: 1, bucketDays: 1 },
  week: { days: 7, bucketDays: 1 },
  month: { days: 30, bucketDays: 1 },
  quarter: { days: 90, bucketDays: 1 },
  year: { days: 365, bucketDays: 7 },
};

/**
 * Fetch the live service summary from a consumer's Upptime monitoring repo.
 * Cached ~by the CDN for a couple of minutes, matching Upptime's update cadence.
 *
 * @param owner - GitHub owner of the monitoring repo
 * @param repo - monitoring repo name
 * @param branch - branch the data lives on
 * @returns the per-service summary array (throws on a non-OK response).
 */
export async function fetchSummary(
  owner: string,
  repo: string,
  branch: string,
): Promise<ServiceSummary[]> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/history/summary.json`;
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`summary.json ${res.status}`);
  return (await res.json()) as ServiceSummary[];
}

/**
 * Fetch open incidents and maintenance windows from GitHub Issues.
 * Unauthenticated and best-effort: on a rate-limit (HTTP 403) it resolves to an
 * empty list rather than throwing, so the page still renders the live status.
 *
 * @param owner - GitHub owner of the monitoring repo
 * @param repo - monitoring repo name
 * @returns open incidents, maintenance first, newest first within each group.
 */
export async function fetchIncidents(owner: string, repo: string): Promise<Incident[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=100`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const issues = (await res.json()) as Array<{
    number: number;
    title: string;
    html_url: string;
    created_at: string;
    pull_request?: unknown;
    labels: Array<{ name: string }>;
  }>;
  return issues
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      url: i.html_url,
      createdAt: i.created_at,
      isMaintenance: i.labels.some((l) => l.name === "maintenance"),
    }));
}

/**
 * Fetch the repo's creation date as the monitoring-start boundary, cached forever
 * in localStorage (it never changes). Days before this render as ghost bars.
 *
 * @param owner - GitHub owner of the monitoring repo
 * @param repo - monitoring repo name
 * @returns ISO date (YYYY-MM-DD) the repo was created, or null on failure.
 */
export async function fetchMonitoringStart(owner: string, repo: string): Promise<string | null> {
  const key = `velvet:created:${owner}/${repo}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return cached;
  } catch {
    // localStorage unavailable; fall through to a network lookup.
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { created_at?: string };
    const created = data.created_at?.slice(0, 10) ?? null;
    if (created) {
      try {
        localStorage.setItem(key, created);
      } catch {
        // ignore persistence failures
      }
    }
    return created;
  } catch {
    return null;
  }
}

/**
 * Derive the most severe day status from minutes-down, for one bar segment.
 *
 * @param minutesDown - minutes the service was down on a given day
 * @returns `up` for no downtime, `down` past {@link DOWN_DAY_THRESHOLD} of the day, else `degraded`
 */
function gradeDay(minutesDown: number): ServiceStatus {
  if (minutesDown <= 0) return "up";
  if (minutesDown / MINUTES_PER_DAY >= DOWN_DAY_THRESHOLD) return "down";
  return "degraded";
}

/** Most severe status across a bucket of days. */
function worstStatus(statuses: ServiceStatus[]): ServiceStatus {
  if (statuses.includes("down")) return "down";
  if (statuses.includes("degraded")) return "degraded";
  return "up";
}

/**
 * Build the uptime-bar series for a range. Short ranges (24h/7d/30d) render one
 * bar per day; the 1-year range aggregates seven days into each weekly bar so the
 * strip stays legible. Days before monitoring began are flagged `hasData: false`
 * and render as faint "ghost" bars.
 *
 * @param service - the service summary holding `dailyMinutesDown`
 * @param range - the selected history window
 * @param today - ISO date string for "today" (injected so the build stays deterministic and testable)
 * @param monitoringStart - ISO date monitoring began; null when unknown
 * @returns one {@link DayStatus} per bar, oldest → newest
 */
export function barsForRange(
  service: ServiceSummary,
  range: RangeKey,
  today: string,
  monitoringStart?: string | null,
): DayStatus[] {
  const spec = RANGE_SPECS[range];
  const totalDays = spec.days;
  const bucketDays = spec.bucketDays;

  // Per-day series, oldest → newest.
  const end = new Date(`${today}T00:00:00Z`);
  const days: Array<{ date: string; minutesDown: number; hasData: boolean }> = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const hasData = !monitoringStart || date >= monitoringStart;
    days.push({ date, minutesDown: service.dailyMinutesDown[date] ?? 0, hasData });
  }

  if (bucketDays <= 1) {
    return days.map((x) => ({
      date: x.date,
      status: gradeDay(x.minutesDown),
      minutesDown: x.minutesDown,
      hasData: x.hasData,
      spanDays: 1,
    }));
  }

  // Aggregate into buckets of `bucketDays`. The oldest bucket may be partial so
  // that the newest bar (today) always sits on a full bucket boundary.
  const bars: DayStatus[] = [];
  const remainder = days.length % bucketDays;
  let cursor = 0;
  let size = remainder === 0 ? bucketDays : remainder;
  while (cursor < days.length) {
    const chunk = days.slice(cursor, cursor + size);
    const real = chunk.filter((x) => x.hasData);
    bars.push({
      date: chunk[chunk.length - 1].date,
      status: worstStatus(real.map((x) => gradeDay(x.minutesDown))),
      minutesDown: chunk.reduce((sum, x) => sum + x.minutesDown, 0),
      hasData: real.length > 0,
      spanDays: chunk.length,
    });
    cursor += size;
    size = bucketDays;
  }
  return bars;
}

/**
 * Worst-case roll-up across all services for the hero banner.
 *
 * @returns `down` if any service is down, `degraded` if any is degraded, else `up`
 */
export function overallStatus(services: ServiceSummary[]): ServiceStatus {
  if (services.some((s) => s.status === "down")) return "down";
  if (services.some((s) => s.status === "degraded")) return "degraded";
  return "up";
}

/**
 * Compute an uptime percentage over the trailing `days` from `dailyMinutesDown`,
 * counting only days since monitoring began. Used for ranges Upptime's
 * summary.json has no precomputed field for (the 90-day range).
 *
 * @param service - the service summary holding `dailyMinutesDown`
 * @param days - trailing days to cover
 * @param today - ISO date for "today"
 * @param monitoringStart - ISO date monitoring began; earlier days are excluded
 * @returns a formatted percentage string, falling back to the 30-day field before any day is monitored
 */
function computeUptime(
  service: ServiceSummary,
  days: number,
  today: string,
  monitoringStart?: string | null,
): string {
  const end = new Date(`${today}T00:00:00Z`);
  let monitoredDays = 0;
  let downMinutes = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    if (monitoringStart && date < monitoringStart) continue;
    monitoredDays++;
    downMinutes += service.dailyMinutesDown[date] ?? 0;
  }
  if (monitoredDays === 0) return service.uptimeMonth;
  const pct = Math.max(0, 100 - (downMinutes / (monitoredDays * MINUTES_PER_DAY)) * 100);
  return `${pct.toFixed(2)}%`;
}

/**
 * Pick the uptime percentage string for the selected range. Most ranges read
 * Upptime's precomputed summary.json fields; the 90-day range has no such field,
 * so it is computed from `dailyMinutesDown` over the monitored days.
 *
 * @param service - the service summary
 * @param range - the selected window
 * @param today - ISO date for "today" (only used for the computed 90-day range)
 * @param monitoringStart - ISO date monitoring began; days before are excluded
 * @returns a formatted percentage string (e.g. "99.97%")
 */
export function uptimeForRange(
  service: ServiceSummary,
  range: RangeKey,
  today: string,
  monitoringStart?: string | null,
): string {
  switch (range) {
    case "day":
      return service.uptimeDay;
    case "week":
      return service.uptimeWeek;
    case "month":
      return service.uptimeMonth;
    case "year":
      return service.uptimeYear;
    case "quarter":
      return computeUptime(service, RANGE_SPECS.quarter.days, today, monitoringStart);
  }
}
