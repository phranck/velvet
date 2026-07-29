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

export type RangeKey = "day" | "week" | "month" | "quarter" | "year";
