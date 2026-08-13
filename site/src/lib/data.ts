import type {
  DayStatus,
  IncidentEvent,
  MaintenanceEvent,
  RangeKey,
  Service,
  ServiceStatus,
} from "./types";

const DOWN_SEGMENT_THRESHOLD = 0.3;
const DAY_MS = 24 * 60 * 60 * 1_000;

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
 * How many days one bar stands for, over a window of this length.
 *
 * A bar per day is what the strip is drawn for, and it stops being readable
 * somewhere past ninety of them: the bars go narrower than the gaps between
 * them. So the bar grows with the window, first to a week and then to a month,
 * and each step is placed where the bar count would otherwise pass ninety.
 */
function bucketForSpan(days: number): number {
  if (days <= 90) return 1;
  if (days <= 90 * 7) return 7;
  return 30;
}

/**
 * How long a range is and how much of it one bar covers.
 *
 * `all` states neither, because both follow from the installation rather than
 * from the range: it reaches back to the day monitoring began, and its bars
 * grow with that distance.
 *
 * @param range - The window being read.
 * @param generatedAt - When the data was written.
 * @param monitoringStartedAt - The first day this installation measured.
 * @returns The window's length in days and the days one bar stands for.
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

/**
 * What stands at the far end of a strip or a plot.
 *
 * A stated length names itself. `all` names the day the installation began,
 * because that day is a different one on every installation and "everything"
 * tells a reader nothing about how much that is.
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

/** Built once, because a label is written on every service of every page. */
const SINCE_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export const STATUS_HERO: Record<
  ServiceStatus,
  { text: string; icon: string }
> = {
  operational: { text: "All systems operational", icon: "ph-check-circle" },
  unknown: { text: "System status unavailable", icon: "ph-question" },
  degraded: { text: "Some systems degraded", icon: "ph-warning" },
  outage: { text: "Major service outage", icon: "ph-x-circle" },
};

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

function worstStatus(statuses: ServiceStatus[]): ServiceStatus {
  return statuses.reduce<ServiceStatus>(
    (worst, status) =>
      statusRank[status] > statusRank[worst] ? status : worst,
    "operational",
  );
}

function rangeDates(generatedAt: string, days: number): string[] {
  const end = new Date(`${generatedAt.slice(0, 10)}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function maintenanceForPeriod(
  events: IncidentEvent[],
  serviceId: string,
  startsAt: number,
  endsAt: number,
): MaintenanceEvent[] {
  return events
    .filter(
      (event): event is MaintenanceEvent =>
        event.kind === "maintenance" &&
        event.affectedServiceIds.includes(serviceId) &&
        Date.parse(event.startsAt) < endsAt &&
        Date.parse(event.endsAt) > startsAt,
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function barsForRange(
  service: Service,
  range: RangeKey,
  generatedAt: string,
  monitoringStartedAt: string,
  events: IncidentEvent[] = [],
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
          : statusForAvailability(
              day.unavailableSeconds,
              day.monitoredSeconds,
            ),
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
  const remainder = days.length % spec.bucketDays;
  let cursor = 0;
  let size = remainder === 0 ? spec.bucketDays : remainder;
  while (cursor < days.length) {
    const bucket = days.slice(cursor, cursor + size);
    const monitoredDays = bucket.filter(({ hasData }) => hasData);
    const maintenance = [
      ...new Map(
        bucket
          .flatMap((day) => day.maintenance)
          .map((event) => [event.id, event]),
      ).values(),
    ];
    bars.push({
      date: bucket[bucket.length - 1]!.date,
      status: worstStatus(monitoredDays.map(({ status }) => status)),
      minutesDown: bucket.reduce(
        (total, { minutesDown }) => total + minutesDown,
        0,
      ),
      hasData: monitoredDays.length > 0,
      spanDays: bucket.length,
      maintenance,
    });
    cursor += size;
    size = spec.bucketDays;
  }
  return bars;
}

export function overallStatus(services: Service[]): ServiceStatus {
  if (services.length === 0) return "unknown";
  return worstStatus(services.map(({ status }) => status));
}

export function visibleIncidentEvents(
  events: IncidentEvent[],
): IncidentEvent[] {
  return events
    .filter(
      (event) =>
        (event.kind === "incident" && event.state === "open") ||
        (event.kind === "maintenance" && event.state !== "completed"),
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function uptimeForRange(
  service: Service,
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
