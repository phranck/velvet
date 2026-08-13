import type {
  IncidentsDocument,
  StatusDocument,
} from "@velvet/contracts";

export type {
  IncidentsDocument,
  ResponseTimesDocument,
  StatusDocument,
} from "@velvet/contracts";

export type Service = StatusDocument["services"][number];
export type ServiceCheck = Service["checks"][number];
export type ServiceStatus = Service["status"];
export type IncidentEvent = IncidentsDocument["events"][number];
export type MaintenanceEvent = Extract<IncidentEvent, { kind: "maintenance" }>;

export interface DayStatus {
  date: string;
  status: ServiceStatus;
  minutesDown: number;
  hasData: boolean;
  spanDays: number;
  maintenance: MaintenanceEvent[];
}

/**
 * The windows a page can be read over.
 *
 * `all` has no length of its own. It reaches back to the day monitoring began,
 * so it is a few hours on an installation's first day and years on an old one.
 */
export type RangeKey = "month" | "quarter" | "all";
