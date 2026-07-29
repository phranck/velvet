import type {
  MonitorDailyAvailability,
  MonitorImportedDailyAvailability,
  MonitorMaintenanceWindow,
  MonitorResponseSample,
  MonitorServiceState,
  MonitorStateChange,
} from "./state.js";
import type {
  MonitorObservation,
  TargetAvailability,
} from "./orchestrator.js";

const DAY_MS = 86_400_000;

interface AvailabilityInterval {
  startsAt: number;
  endsAt: number;
  targetAvailability: TargetAvailability;
}

export interface DailyAvailabilityInput {
  serviceId: string;
  monitoringStartedAt: string;
  generatedAt: string;
  retentionDays: number;
  stateChanges: MonitorStateChange[];
  maintenanceWindows: MonitorMaintenanceWindow[];
}

export interface StateChangeRun {
  runId: string;
  changedAt: string;
}

export interface ResponseSampleRetention {
  generatedAt: string;
  retentionDays: number;
}

export interface ImportedDailyAvailabilityRetention {
  generatedAt: string;
  retentionDays: number;
}

export interface DailyAvailabilityMergeInput
  extends ImportedDailyAvailabilityRetention {
  serviceId: string;
  monitoringStartedAt: string;
  imported: MonitorImportedDailyAvailability[];
  native: MonitorDailyAvailability[];
}

export function appendStateChanges(
  history: MonitorStateChange[],
  serviceStates: MonitorServiceState[],
  run: StateChangeRun,
): MonitorStateChange[] {
  const nextHistory = [...history];
  const latestByService = new Map<string, MonitorStateChange>();
  for (const change of history) {
    latestByService.set(change.serviceId, change);
  }

  for (const service of serviceStates) {
    const previous = latestByService.get(service.serviceId);
    if (
      previous?.status === service.status &&
      previous.targetAvailability === service.targetAvailability
    ) {
      continue;
    }

    const change: MonitorStateChange = {
      runId: run.runId,
      serviceId: service.serviceId,
      changedAt: run.changedAt,
      status: service.status,
      targetAvailability: service.targetAvailability,
    };
    nextHistory.push(change);
    latestByService.set(service.serviceId, change);
  }

  return nextHistory;
}

export function compactStateChanges(
  history: MonitorStateChange[],
  generatedAt: string,
  retentionDays: number,
): MonitorStateChange[] {
  const cutoff = Date.parse(generatedAt) - retentionDays * DAY_MS;
  const boundaryByService = new Map<string, MonitorStateChange>();
  const retained: MonitorStateChange[] = [];

  for (const change of history) {
    if (Date.parse(change.changedAt) <= cutoff) {
      const boundary = boundaryByService.get(change.serviceId);
      if (
        boundary === undefined ||
        change.changedAt.localeCompare(boundary.changedAt) > 0
      ) {
        boundaryByService.set(change.serviceId, change);
      }
      continue;
    }
    retained.push(change);
  }

  return [...boundaryByService.values(), ...retained].sort(
    (left, right) =>
      left.changedAt.localeCompare(right.changedAt) ||
      left.serviceId.localeCompare(right.serviceId) ||
      left.runId.localeCompare(right.runId),
  );
}

export function appendResponseSamples(
  history: MonitorResponseSample[],
  observations: Array<
    Pick<
      MonitorObservation,
      "serviceId" | "checkId" | "checkedAt" | "responseTimeMs"
    >
  >,
  options: ResponseSampleRetention,
): MonitorResponseSample[] {
  const earliestTimestamp =
    Date.parse(options.generatedAt) - options.retentionDays * DAY_MS;
  const samplesByIdentity = new Map<string, MonitorResponseSample>();
  const append = (sample: MonitorResponseSample): void => {
    if (Date.parse(sample.timestamp) < earliestTimestamp) {
      return;
    }
    const identity = `${sample.serviceId}\u0000${sample.checkId}\u0000${sample.timestamp}`;
    if (!samplesByIdentity.has(identity)) {
      samplesByIdentity.set(identity, sample);
    }
  };

  history.forEach(append);
  observations.forEach((observation) => {
    append({
      serviceId: observation.serviceId,
      checkId: observation.checkId,
      timestamp: observation.checkedAt,
      responseTimeMs: observation.responseTimeMs,
    });
  });

  return [...samplesByIdentity.values()].sort(
    (left, right) =>
      left.timestamp.localeCompare(right.timestamp) ||
      left.serviceId.localeCompare(right.serviceId) ||
      left.checkId.localeCompare(right.checkId),
  );
}

function dayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
}

export function compactImportedDailyAvailability(
  history: MonitorImportedDailyAvailability[],
  options: ImportedDailyAvailabilityRetention,
): MonitorImportedDailyAvailability[] {
  const cutoff =
    Date.parse(options.generatedAt) - options.retentionDays * DAY_MS;
  const generatedDate = options.generatedAt.slice(0, 10);

  return history
    .filter(
      ({ date }) =>
        Date.parse(`${date}T00:00:00.000Z`) >= cutoff &&
        date <= generatedDate,
    )
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.serviceId.localeCompare(right.serviceId),
    );
}

export function mergeDailyAvailability(
  input: DailyAvailabilityMergeInput,
): MonitorDailyAvailability[] {
  const firstMonitoringDate = input.monitoringStartedAt.slice(0, 10);
  const valuesByDate = new Map<string, MonitorDailyAvailability>();

  for (const value of compactImportedDailyAvailability(input.imported, input)) {
    if (
      value.serviceId !== input.serviceId ||
      value.date < firstMonitoringDate
    ) {
      continue;
    }
    valuesByDate.set(value.date, {
      date: value.date,
      monitoredSeconds: value.monitoredSeconds,
      unavailableSeconds: value.unavailableSeconds,
    });
  }
  for (const value of input.native) {
    valuesByDate.set(value.date, value);
  }

  return [...valuesByDate.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

function availabilityIntervals(
  input: DailyAvailabilityInput,
): AvailabilityInterval[] {
  const monitoringStartedAt = Date.parse(input.monitoringStartedAt);
  const generatedAt = Date.parse(input.generatedAt);
  const availabilityStartsAt = Math.max(
    monitoringStartedAt,
    generatedAt - input.retentionDays * DAY_MS,
  );
  const changes = input.stateChanges
    .filter(({ serviceId }) => serviceId === input.serviceId)
    .sort((left, right) => left.changedAt.localeCompare(right.changedAt));
  const intervals: AvailabilityInterval[] = [];
  let intervalStartsAt = availabilityStartsAt;
  let targetAvailability: TargetAvailability = "unobserved";

  for (const change of changes) {
    const changedAt = Date.parse(change.changedAt);
    if (changedAt <= availabilityStartsAt) {
      targetAvailability = change.targetAvailability;
      continue;
    }
    if (changedAt >= generatedAt) {
      break;
    }

    intervals.push({
      startsAt: intervalStartsAt,
      endsAt: changedAt,
      targetAvailability,
    });
    intervalStartsAt = changedAt;
    targetAvailability = change.targetAvailability;
  }

  if (intervalStartsAt < generatedAt) {
    intervals.push({
      startsAt: intervalStartsAt,
      endsAt: generatedAt,
      targetAvailability,
    });
  }

  return intervals;
}

export function deriveDailyAvailability(
  input: DailyAvailabilityInput,
): MonitorDailyAvailability[] {
  const monitoringStartedAt = Date.parse(input.monitoringStartedAt);
  const generatedAt = Date.parse(input.generatedAt);
  const availabilityStartsAt = Math.max(
    monitoringStartedAt,
    generatedAt - input.retentionDays * DAY_MS,
  );
  const intervals = availabilityIntervals(input);
  const days: MonitorDailyAvailability[] = [];

  for (
    let currentDay = dayStart(availabilityStartsAt);
    currentDay < generatedAt;
    currentDay += DAY_MS
  ) {
    const nextDay = currentDay + DAY_MS;
    let monitoredMs = 0;
    let unavailableMs = 0;

    for (const interval of intervals) {
      const startsAt = Math.max(interval.startsAt, currentDay);
      const endsAt = Math.min(interval.endsAt, nextDay);
      if (
        startsAt >= endsAt ||
        interval.targetAvailability === "unobserved"
      ) {
        continue;
      }

      const duration = endsAt - startsAt;
      monitoredMs += duration;
      if (interval.targetAvailability === "unavailable") {
        unavailableMs += duration;
      }
    }

    const monitoredSeconds = Math.floor(monitoredMs / 1_000);
    if (monitoredSeconds > 0) {
      days.push({
        date: new Date(currentDay).toISOString().slice(0, 10),
        monitoredSeconds,
        unavailableSeconds: Math.floor(unavailableMs / 1_000),
      });
    }
  }

  return days;
}
