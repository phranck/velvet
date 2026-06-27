/** Service status as reported by Upptime in `history/summary.json`. */
export type ServiceStatus = "up" | "degraded" | "down";

/**
 * One service entry from Upptime's `history/summary.json`.
 * @see https://github.com/upptime/upptime
 */
export interface ServiceSummary {
  name: string;
  url: string;
  icon: string;
  slug: string;
  status: ServiceStatus;
  uptime: string;
  uptimeDay: string;
  uptimeWeek: string;
  uptimeMonth: string;
  uptimeYear: string;
  time: number;
  timeDay: number;
  timeWeek: number;
  timeMonth: number;
  timeYear: number;
  /** Map of ISO date (YYYY-MM-DD) → minutes the service was down that day. */
  dailyMinutesDown: Record<string, number>;
  /**
   * IPv6 counterpart of this service, folded in from a sibling check whose slug
   * is `<this.slug>-ipv6` (typically a Globalping check with `ipv6: true`). When
   * present, the card shows both protocols; this entry itself is then the IPv4 side.
   */
  ipv6?: ServiceSummary;
}

/**
 * Status of one uptime-bar segment. For short ranges a segment is a single day;
 * for the 1-year range several days are aggregated into one bar so the strip
 * stays legible — see {@link DayStatus.spanDays}.
 */
export interface DayStatus {
  /** ISO date (YYYY-MM-DD); for an aggregated bar, the most recent day in the bucket. */
  date: string;
  status: ServiceStatus;
  /** Minutes down across the segment (summed over the bucket for aggregated bars). */
  minutesDown: number;
  /** False for days before monitoring began — rendered as a faint "ghost" bar. */
  hasData: boolean;
  /** Number of days this segment aggregates (1 = a single day). */
  spanDays: number;
}

/** An open incident or maintenance window, sourced from GitHub Issues. */
export interface Incident {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  isMaintenance: boolean;
}

/** Selectable history window for the uptime bar and headline figure (capped at 1 year). */
export type RangeKey = "day" | "week" | "month" | "quarter" | "year";
