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
}

/**
 * Status of one uptime-bar segment. For short ranges a segment is a single day;
 * for long ranges (1y, all) several days are aggregated into one bar so the
 * strip stays legible — see {@link DayStatus.spanDays}.
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

/** Selectable history window for the uptime bar and headline figure. */
export type RangeKey = "day" | "week" | "month" | "year" | "all";
