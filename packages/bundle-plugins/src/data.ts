/**
 * The shapes the plugins take, defined here because they belong to the drawing
 * rather than to the monitor.
 *
 * A plugin never reads a contract document. It is handed what a design decided
 * to show it, and these are the shapes that decision arrives in. They are
 * structurally what `site/src/lib/types.ts` re-exports, so nothing has to be
 * converted between the page and the plugins it uses.
 */

/** The five ranges a status page offers. */
/**
 * The windows a page can be read over.
 *
 * `all` has no length of its own. It reaches back to the day monitoring began,
 * so it is a few hours on an installation's first day and years on an old one.
 */
export type RangeKey = "month" | "quarter" | "all";

/** How a service stood at a moment. */
export type ServiceStatus = "operational" | "degraded" | "outage" | "unknown";

/** A maintenance window, as much of one as the strip needs to name it. */
export interface MaintenanceWindow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
}

/**
 * One segment of the availability strip.
 *
 * A segment covers one day in every range but the year, where 365 days are
 * grouped into 53 weekly buckets and `spanDays` says how many days a bar
 * covers. `hasData` is not the same as an operational status: a day nobody
 * measured can still carry one, which is why the strip decides its colour from
 * this field first.
 */
export interface DayStatus {
  date: string;
  status: ServiceStatus;
  minutesDown: number;
  hasData: boolean;
  spanDays: number;
  maintenance: MaintenanceWindow[];
}

/** One response-time measurement, or the record of one that failed. */
export interface ResponseSample {
  timestamp: string;
  responseTimeMs: number | null;
}

/** Every measurement for one service over one protocol. */
export interface ResponseSeriesEntry {
  serviceId: string;
  checkId: string;
  protocol: "ipv4" | "ipv6";
  samples: ResponseSample[];
}

/** The series a chart is handed, which is one per protocol of one service. */
export type ResponseSeries = ResponseSeriesEntry[];
