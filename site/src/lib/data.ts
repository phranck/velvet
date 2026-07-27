import type {
  DayStatus,
  IncidentEvent,
  RangeKey,
  Service,
  ServiceStatus,
} from "./types";

const DOWN_SEGMENT_THRESHOLD = 0.3;

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

export const RANGE_LABEL: Record<RangeKey, string> = {
  day: "24h ago",
  week: "7 days ago",
  month: "30 days ago",
  quarter: "90 days ago",
  year: "1 year ago",
};

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

export function barsForRange(
  service: Service,
  range: RangeKey,
  generatedAt: string,
  monitoringStartedAt: string,
): DayStatus[] {
  const spec = RANGE_SPECS[range];
  const availability = new Map(
    service.dailyAvailability.map((day) => [day.date, day]),
  );
  const monitoringStartDate = monitoringStartedAt.slice(0, 10);
  const days = rangeDates(generatedAt, spec.days).map((date) => {
    const day = availability.get(date);
    const hasData = date >= monitoringStartDate && day !== undefined;
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
    bars.push({
      date: bucket[bucket.length - 1]!.date,
      status: worstStatus(monitoredDays.map(({ status }) => status)),
      minutesDown: bucket.reduce(
        (total, { minutesDown }) => total + minutesDown,
        0,
      ),
      hasData: monitoredDays.length > 0,
      spanDays: bucket.length,
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
  const dates = new Set(rangeDates(generatedAt, RANGE_SPECS[range].days));
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
