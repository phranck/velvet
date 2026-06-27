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

/** Per-day status used to render one segment of the 90-day uptime bar. */
export interface DayStatus {
  date: string;
  status: ServiceStatus;
  minutesDown: number;
  /** False for days before monitoring began — rendered as a faint "ghost" bar. */
  hasData: boolean;
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
export type RangeKey = "day" | "week" | "month" | "year";
