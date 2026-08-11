/**
 * This bundle's own arithmetic.
 *
 * It borrows nothing, which is the point of the exercise: a bundle that shares
 * no code with any other still has to put the right figure on the page. The
 * conformance suite compares what this computes against the reference
 * arithmetic from the same fixture, so getting it wrong is caught there rather
 * than being discovered by an operator.
 */

import type { BundleData } from "../../src/lib/bundles/data.js";

/** The ranges this design offers, with the labels it prints. */
export const RANGES = [
  { key: "day", label: "24h", days: 1 },
  { key: "week", label: "7d", days: 7 },
  { key: "month", label: "30d", days: 30 },
  { key: "quarter", label: "90d", days: 90 },
  { key: "year", label: "1yr", days: 365 },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

/** How many days a range covers. */
export function daysIn(range: string): number {
  return RANGES.find(({ key }) => key === range)?.days ?? 30;
}

/** The dates a range covers, ending on the day the data was generated. */
function datesFor(generatedAt: string, days: number): Set<string> {
  const end = new Date(`${generatedAt.slice(0, 10)}T00:00:00.000Z`);
  const dates = new Set<string>();
  for (let index = 0; index < days; index += 1) {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - index);
    dates.add(date.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * The uptime figure for one service over one range.
 *
 * Days before monitoring began are not counted as perfect days, which is the
 * mistake that makes a page report a fresh installation as flawless.
 *
 * @param data - Everything the bundle was given.
 * @param serviceId - The service to report on.
 * @param range - The range the visitor picked.
 * @returns The figure as it is printed, including "No data".
 */
export function uptimeFor(
  data: BundleData,
  serviceId: string,
  range: string,
): string {
  const service = data.status.services.find(({ id }) => id === serviceId);
  if (!service) return "No data";
  const dates = datesFor(data.status.generatedAt, daysIn(range));
  const start = data.status.monitoringStartedAt.slice(0, 10);
  const days = service.dailyAvailability.filter(
    ({ date }) => dates.has(date) && date >= start,
  );
  const monitored = days.reduce((total, day) => total + day.monitoredSeconds, 0);
  if (monitored === 0) return "No data";
  const unavailable = days.reduce(
    (total, day) => total + day.unavailableSeconds,
    0,
  );
  return `${Math.max(0, 100 - (unavailable / monitored) * 100).toFixed(2)}%`;
}

/** The incidents and maintenance windows a visitor is meant to see. */
export function visibleEvents(data: BundleData) {
  return data.incidents.events
    .filter(
      (event) =>
        (event.kind === "incident" && event.state === "open") ||
        (event.kind === "maintenance" && event.state !== "completed"),
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

/** The worst state any service is in, which is what the page reports overall. */
export function overall(data: BundleData): string {
  const rank: Record<string, number> = {
    operational: 0,
    unknown: 1,
    degraded: 2,
    outage: 3,
  };
  if (data.status.services.length === 0) return "unknown";
  return data.status.services
    .map(({ status }) => status)
    .reduce((worst, status) => ((rank[status] ?? 0) > (rank[worst] ?? 0) ? status : worst));
}
