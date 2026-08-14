/**
 * The arithmetic behind every figure a status page prints.
 *
 * A design decides what its page looks like and what it says. What a figure
 * *is* is not a design decision: 99.97 per cent over thirty days is the same
 * number in every design, and a page that prints a different one is wrong
 * rather than distinctive.
 *
 * This is the same arithmetic `site/src/lib/data.ts` runs, offered here so a
 * design need not carry a second copy of it. Like everything here it is optional:
 * a design may do its own, and the conformance suite compares what it printed
 * against what this computes from the same fixture, so a design that gets it
 * wrong is caught rather than published.
 *
 * Two rules in here are the ones a second implementation gets wrong, and both
 * turn a page into a lie rather than into a mistake:
 *
 *   - A day before monitoring began is not a perfect day. Counting it makes a
 *     fresh installation report itself as flawless.
 *   - A day nothing was measured on carries `hasData: false` whatever status it
 *     records, because such a day is recorded as operational and reading the
 *     status first paints an empty day as a working one.
 */

import type {
  DayStatus,
  MaintenanceWindow,
  RangeKey,
  ServiceStatus,
} from "./data.js";

export type { RangeKey, ServiceStatus } from "./data.js";


/** How much of a day has to be lost before it reads as an outage. */
const DOWN_SEGMENT_THRESHOLD = 0.3;

const DAY_MS = 24 * 60 * 60 * 1_000;

/** One service's day-by-day availability, as the contract records it. */
export interface AvailabilityDay {
  date: string;
  monitoredSeconds: number;
  unavailableSeconds: number;
}

/** As much of a service as the arithmetic needs. */
export interface StatusService {
  id: string;
  status: ServiceStatus;
  dailyAvailability: AvailabilityDay[];
}

/** As much of an incident or maintenance window as the arithmetic needs. */
export interface StatusEvent {
  id: string;
  kind: "incident" | "maintenance";
  state: string;
  title: string;
  affectedServiceIds: string[];
  startsAt: string;
  endsAt: string | null;
}

/** How long a range covers, and how many days one segment stands for. */
interface RangeSpec {
  days: number;
  bucketDays: number;
}

/** The two ranges that are a stated length, whatever the installation is. */
const FIXED_SPECS: Record<"month" | "quarter", RangeSpec> = {
  month: { days: 30, bucketDays: 1 },
  quarter: { days: 90, bucketDays: 1 },
};

/** Whole days from one instant to another, counting both ends. */
function daysCovered(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00.000Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00.000Z`);
  return Math.max(1, Math.round((to - from) / DAY_MS) + 1);
}

/**
 * How many days one segment stands for, over a window of this length.
 *
 * A segment per day is what the strip is drawn for, and it stops being readable
 * somewhere past ninety of them, where the segments go narrower than the gaps
 * between them. So the segment grows with the window, first to a week and then
 * to a month, each step placed where the count would otherwise pass ninety.
 */
function bucketForSpan(days: number): number {
  if (days <= 90) return 1;
  if (days <= 90 * 7) return 7;
  return 30;
}

/**
 * How long a range is and how much of it one segment covers.
 *
 * `all` states neither, because both follow from the installation rather than
 * from the range: it reaches back to the day monitoring began, and its segments
 * grow with that distance.
 *
 * @param range - The window being read.
 * @param generatedAt - When the data was written.
 * @param monitoringStartedAt - The first day this installation measured.
 * @returns The window's length in days and the days one segment stands for.
 */
export function rangeSpec(
  range: RangeKey,
  generatedAt: string,
  monitoringStartedAt: string,
): RangeSpec {
  if (range !== "all") return FIXED_SPECS[range];
  const days = daysCovered(monitoringStartedAt, generatedAt);
  return { days, bucketDays: bucketForSpan(days) };
}

/** Built once, because this label is written on every service of every page. */
const SINCE_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * How far back a range reaches, for a design that labels the far end.
 *
 * A stated length names itself. `all` names the day the installation began,
 * because that day differs per installation and the word "everything" tells a
 * reader nothing about how much that is.
 *
 * @param range - The window being read.
 * @param monitoringStartedAt - The first day this installation measured.
 * @returns The label for the leading end of the window.
 */
export function rangeLabel(
  range: RangeKey,
  monitoringStartedAt: string,
): string {
  if (range === "month") return "30 days ago";
  if (range === "quarter") return "90 days ago";
  return SINCE_DATE.format(new Date(monitoringStartedAt));
}

/**
 * How many days a range covers, for a design that says so in words.
 *
 * @param range - The window being read.
 * @param generatedAt - When the data was written.
 * @param monitoringStartedAt - The first day this installation measured.
 * @returns The number of days the window spans.
 */
export function daysInRange(
  range: RangeKey,
  generatedAt: string,
  monitoringStartedAt: string,
): number {
  return rangeSpec(range, generatedAt, monitoringStartedAt).days;
}

/** Which state a day's lost time amounts to. */
function statusForAvailability(
  unavailableSeconds: number,
  monitoredSeconds: number,
): ServiceStatus {
  if (unavailableSeconds <= 0) return "operational";
  if (unavailableSeconds / monitoredSeconds >= DOWN_SEGMENT_THRESHOLD) {
    return "outage";
  }
  return "degraded";
}

const statusRank: Record<ServiceStatus, number> = {
  operational: 0,
  unknown: 1,
  degraded: 2,
  outage: 3,
};

/** The worst of several states, which is what a summary reports. */
function worstStatus(statuses: ServiceStatus[]): ServiceStatus {
  return statuses.reduce<ServiceStatus>(
    (worst, status) => (statusRank[status] > statusRank[worst] ? status : worst),
    "operational",
  );
}

/** The dates a range covers, oldest first, ending on the generation date. */
function rangeDates(generatedAt: string, days: number): string[] {
  const end = new Date(`${generatedAt.slice(0, 10)}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

/** The maintenance windows overlapping one day, for the segment covering it. */
function maintenanceForPeriod(
  events: StatusEvent[],
  serviceId: string,
  startsAt: number,
  endsAt: number,
): MaintenanceWindow[] {
  return events
    .filter(
      (event) =>
        event.kind === "maintenance" &&
        event.endsAt !== null &&
        event.affectedServiceIds.includes(serviceId) &&
        Date.parse(event.startsAt) < endsAt &&
        Date.parse(event.endsAt) > startsAt,
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt!,
    }));
}

/**
 * The segments of the availability strip for one service over one range.
 *
 * @param service - The service to report on.
 * @param range - The range a visitor picked.
 * @param generatedAt - The moment the data was generated, which is "now".
 * @param monitoringStartedAt - When this installation began measuring.
 * @param events - Incidents and maintenance windows, so a segment can be
 *   marked as planned rather than as a failure.
 * @returns One segment per day, or per week or month over a longer window,
 *   oldest first.
 */
export function barsForRange(
  service: StatusService,
  range: RangeKey,
  generatedAt: string,
  monitoringStartedAt: string,
  events: StatusEvent[] = [],
): DayStatus[] {
  const spec = rangeSpec(range, generatedAt, monitoringStartedAt);
  const availability = new Map(
    service.dailyAvailability.map((day) => [day.date, day]),
  );
  const monitoringStartDate = monitoringStartedAt.slice(0, 10);
  const days = rangeDates(generatedAt, spec.days).map((date) => {
    const day = availability.get(date);
    const hasData = date >= monitoringStartDate && day !== undefined;
    const dayStartsAt = Date.parse(`${date}T00:00:00.000Z`);
    return {
      date,
      status:
        day === undefined
          ? ("operational" as const)
          : statusForAvailability(day.unavailableSeconds, day.monitoredSeconds),
      minutesDown:
        day === undefined ? 0 : Math.round(day.unavailableSeconds / 60),
      hasData,
      maintenance: maintenanceForPeriod(
        events,
        service.id,
        dayStartsAt,
        dayStartsAt + DAY_MS,
      ),
    };
  });

  if (spec.bucketDays === 1) {
    return days.map((day) => ({ ...day, spanDays: 1 }));
  }

  const bars: DayStatus[] = [];
  // The short bucket goes first, so the newest segment always covers a whole
  // week and the ragged end of the range is at the far side rather than at the
  // one a reader looks at.
  const remainder = days.length % spec.bucketDays;
  let cursor = 0;
  let size = remainder === 0 ? spec.bucketDays : remainder;
  while (cursor < days.length) {
    const bucket = days.slice(cursor, cursor + size);
    const monitoredDays = bucket.filter(({ hasData }) => hasData);
    const maintenance = [
      ...new Map(
        bucket.flatMap((day) => day.maintenance).map((event) => [event.id, event]),
      ).values(),
    ];
    bars.push({
      date: bucket[bucket.length - 1]!.date,
      status: worstStatus(monitoredDays.map(({ status }) => status)),
      minutesDown: bucket.reduce((total, { minutesDown }) => total + minutesDown, 0),
      hasData: monitoredDays.length > 0,
      spanDays: bucket.length,
      maintenance,
    });
    cursor += size;
    size = spec.bucketDays;
  }
  return bars;
}

/**
 * The state the page reports overall, which is the worst any service is in.
 *
 * @param services - Every service the installation watches.
 * @returns The state, or `unknown` where there are no services at all.
 */
export function overallStatus(services: StatusService[]): ServiceStatus {
  if (services.length === 0) return "unknown";
  return worstStatus(services.map(({ status }) => status));
}

/**
 * The incidents and maintenance windows a visitor is meant to see.
 *
 * A completed maintenance window is not one of them, whilst the days it covered
 * are still marked in the strip: the page says what is happening, and the strip
 * says what happened.
 *
 * @param events - Everything the incidents document holds.
 * @returns What to announce, oldest first.
 */
export function visibleEvents<Event extends StatusEvent>(
  events: Event[],
): Event[] {
  return events
    .filter(
      (event) =>
        (event.kind === "incident" && event.state === "open") ||
        (event.kind === "maintenance" && event.state !== "completed"),
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

/**
 * The uptime figure for one service over one range, as it is printed.
 *
 * @param service - The service to report on.
 * @param range - The range a visitor picked.
 * @param generatedAt - The moment the data was generated.
 * @param monitoringStartedAt - When this installation began measuring.
 * @returns The percentage to two decimal places, or `No data` where nothing in
 *   the range was measured at all.
 */
export function uptimeForRange(
  service: StatusService,
  range: RangeKey,
  generatedAt: string,
  monitoringStartedAt: string,
): string {
  const dates = new Set(
    rangeDates(
      generatedAt,
      rangeSpec(range, generatedAt, monitoringStartedAt).days,
    ),
  );
  const monitoringStartDate = monitoringStartedAt.slice(0, 10);
  const availability = service.dailyAvailability.filter(
    ({ date }) => dates.has(date) && date >= monitoringStartDate,
  );
  const monitoredSeconds = availability.reduce(
    (total, day) => total + day.monitoredSeconds,
    0,
  );
  if (monitoredSeconds === 0) return "No data";
  const unavailableSeconds = availability.reduce(
    (total, day) => total + day.unavailableSeconds,
    0,
  );
  const percentage = Math.max(
    0,
    100 - (unavailableSeconds / monitoredSeconds) * 100,
  );
  return `${percentage.toFixed(2)}%`;
}
