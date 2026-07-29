import {
  CONTRACT_SCHEMA_VERSION,
  parseVelvetConfiguration,
  validateIncidentsDocument,
  type IncidentsDocument,
  type NormalizedService,
  type NormalizedVelvetConfiguration,
} from "@velvet/contracts";
import {
  aggregateServiceStatus,
  aggregateServiceTargetAvailability,
  appendResponseSamples,
  appendStateChanges,
  compactImportedDailyAvailability,
  compactStateChanges,
  createResponseTimesDocument,
  createStatusDocument,
  executeMonitorChecks,
  updateCheckState,
  type MonitorCheckState,
  type MonitorObservation,
  type MonitorPersistentState,
  type MonitorRun,
  type MonitorServiceState,
  type MonitorStateContent,
} from "@velvet/monitor";
import {
  reconcileGitHubIncidents,
  type GitHubIssuesClient,
} from "@velvet/github-incidents";

import { MonitorActionError } from "./errors.js";

export type MonitorActionMode = "status" | "response";

export interface MonitorActionInput {
  mode: string;
  runId: string;
  repository: string;
  configurationSource: string;
  currentState: MonitorPersistentState | null;
  currentIncidents: IncidentsDocument | null;
}

export interface MonitorActionSummary {
  mode: MonitorActionMode;
  outcome: "prepared" | "duplicate" | "stale";
  availableChecks: number;
  unavailableChecks: number;
  incidentResult: "reconciled" | "unchanged";
}

export interface PreparedMonitorActionResult {
  outcome: "prepared";
  run: MonitorRun;
  content: MonitorStateContent;
  incidents: IncidentsDocument;
  observations: MonitorObservation[];
  summary: MonitorActionSummary;
}

export interface SkippedMonitorActionResult {
  outcome: "duplicate" | "stale";
  summary: MonitorActionSummary;
}

export type MonitorActionResult =
  | PreparedMonitorActionResult
  | SkippedMonitorActionResult;

export interface MonitorActionDependencies {
  now?: () => Date;
  executeChecks?: typeof executeMonitorChecks;
  incidentClient?: GitHubIssuesClient;
  reconcileIncidents?: typeof reconcileGitHubIncidents;
  writeSummary?: (summary: MonitorActionSummary) => Promise<void> | void;
}

function mode(value: string): MonitorActionMode {
  if (value !== "status" && value !== "response") {
    throw new MonitorActionError("INVALID_MODE");
  }
  return value;
}

function configuration(source: string): NormalizedVelvetConfiguration {
  const result = parseVelvetConfiguration(source);
  if (!result.success) {
    throw new MonitorActionError("INVALID_CONFIGURATION");
  }
  return result.data;
}

function assertRepository(
  configured: NormalizedVelvetConfiguration["repository"],
  repository: string,
): void {
  if (`${configured.owner}/${configured.name}` !== repository) {
    throw new MonitorActionError("REPOSITORY_MISMATCH");
  }
}

function emptyIncidents(generatedAt: string): IncidentsDocument {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt,
    events: [],
  };
}

function checkedIdentities(services: NormalizedService[]): Set<string> {
  return new Set(
    services.flatMap((service) =>
      service.checks.map((check) => `${service.id}\u0000${check.id}`),
    ),
  );
}

function validateObservations(
  services: NormalizedService[],
  observations: MonitorObservation[],
): void {
  const expected = checkedIdentities(services);
  const observed = new Set<string>();
  for (const observation of observations) {
    const identity = `${observation.serviceId}\u0000${observation.checkId}`;
    if (!expected.has(identity) || observed.has(identity)) {
      throw new MonitorActionError("INVALID_OBSERVATIONS");
    }
    observed.add(identity);
    if (observation.targetAvailability === "unobserved") {
      throw new MonitorActionError("UNOBSERVED_CHECK");
    }
  }
  if (observed.size !== expected.size) {
    throw new MonitorActionError("INVALID_OBSERVATIONS");
  }
}

function neutralCheckState(
  observation: MonitorObservation,
): MonitorCheckState {
  return {
    serviceId: observation.serviceId,
    checkId: observation.checkId,
    status: "unavailable",
    confirmedStatus: null,
    confirmedAt: null,
    targetAvailability: "unobserved",
    failureStreak: 0,
    recoveryStreak: 0,
    checkedAt: observation.checkedAt,
    responseTimeMs: null,
    statusCode: null,
    failureCode: null,
  };
}

function configuredCheckStates(
  services: NormalizedService[],
  observations: MonitorObservation[],
  current: MonitorPersistentState | null,
  updateStatus: boolean,
  thresholds: NormalizedVelvetConfiguration["incidents"],
): MonitorCheckState[] {
  const previousByIdentity = new Map(
    (current?.current.checks ?? []).map((check) => [
      `${check.serviceId}\u0000${check.checkId}`,
      check,
    ]),
  );
  const observationsByIdentity = new Map(
    observations.map((observation) => [
      `${observation.serviceId}\u0000${observation.checkId}`,
      observation,
    ]),
  );

  return services.flatMap((service) =>
    service.checks.map((check) => {
      const identity = `${service.id}\u0000${check.id}`;
      const observation = observationsByIdentity.get(identity)!;
      const previous = previousByIdentity.get(identity) ?? null;
      if (!updateStatus) {
        return previous ?? neutralCheckState(observation);
      }
      return updateCheckState(previous, observation, thresholds);
    }),
  );
}

function serviceStates(
  services: NormalizedService[],
  checks: MonitorCheckState[],
): MonitorServiceState[] {
  return services.map((service) => {
    const serviceChecks = checks.filter(
      ({ serviceId }) => serviceId === service.id,
    );
    return {
      serviceId: service.id,
      status: aggregateServiceStatus(serviceChecks),
      targetAvailability:
        aggregateServiceTargetAvailability(serviceChecks),
    };
  });
}

function runOutcome(
  state: MonitorPersistentState | null,
  runId: string,
  startedAt: string,
): "duplicate" | "stale" | null {
  if (state === null) return null;
  if (state.processedRuns.some(({ id }) => id === runId)) return "duplicate";
  const latest = state.processedRuns.at(-1);
  return latest !== undefined &&
    Date.parse(startedAt) <= Date.parse(latest.startedAt)
    ? "stale"
    : null;
}

async function report(
  summary: MonitorActionSummary,
  writeSummary: MonitorActionDependencies["writeSummary"],
): Promise<MonitorActionSummary> {
  await writeSummary?.(summary);
  return summary;
}

export async function runMonitorAction(
  input: MonitorActionInput,
  dependencies: MonitorActionDependencies = {},
): Promise<MonitorActionResult> {
  const runMode = mode(input.mode);
  const parsedConfiguration = configuration(input.configurationSource);
  assertRepository(parsedConfiguration.repository, input.repository);

  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const skipped = runOutcome(input.currentState, input.runId, startedAt);
  if (skipped !== null) {
    const summary = await report(
      {
        mode: runMode,
        outcome: skipped,
        availableChecks: 0,
        unavailableChecks: 0,
        incidentResult: "unchanged",
      },
      dependencies.writeSummary,
    );
    return { outcome: skipped, summary };
  }

  const executeChecks = dependencies.executeChecks ?? executeMonitorChecks;
  let observations: MonitorObservation[];
  try {
    observations = await executeChecks(parsedConfiguration.services);
  } catch (cause) {
    throw new MonitorActionError("INTERNAL_FAILURE", { cause });
  }
  validateObservations(parsedConfiguration.services, observations);
  const completedAt = now().toISOString();
  const run: MonitorRun = {
    id: input.runId,
    kind: runMode === "status" ? "uptime" : "response",
    startedAt,
    completedAt,
  };
  const monitoringStartedAt =
    input.currentState?.monitoringStartedAt ?? startedAt;
  const checks = configuredCheckStates(
    parsedConfiguration.services,
    observations,
    input.currentState,
    runMode === "status",
    parsedConfiguration.incidents,
  );
  const services = serviceStates(parsedConfiguration.services, checks);
  const configuredServiceIds = new Set(
    parsedConfiguration.services.map(({ id }) => id),
  );
  const previousStateChanges = (
    input.currentState?.stateChanges ?? []
  ).filter(({ serviceId }) => configuredServiceIds.has(serviceId));
  const stateChanges =
    runMode === "status"
      ? compactStateChanges(
          appendStateChanges(
            previousStateChanges,
            services,
            { runId: run.id, changedAt: completedAt },
          ),
          completedAt,
          parsedConfiguration.history.retentionDays,
        )
      : previousStateChanges;
  const responseSamples = appendResponseSamples(
    input.currentState?.responseSamples ?? [],
    runMode === "response" ? observations : [],
    {
      generatedAt: completedAt,
      retentionDays: parsedConfiguration.history.retentionDays,
    },
  );
  const previousImportedDailyAvailability = (
    input.currentState?.importedDailyAvailability ?? []
  ).filter(({ serviceId }) => configuredServiceIds.has(serviceId));
  const importedDailyAvailability =
    runMode === "status"
      ? compactImportedDailyAvailability(
          previousImportedDailyAvailability,
          {
            generatedAt: completedAt,
            retentionDays: parsedConfiguration.history.retentionDays,
          },
        )
      : previousImportedDailyAvailability;
  const documentServices = parsedConfiguration.services.map((service) => ({
    id: service.id,
    name: service.name,
    checks: checks.filter(({ serviceId }) => serviceId === service.id),
  }));
  const status =
    runMode === "response" && input.currentState !== null
      ? input.currentState.documents.status
      : createStatusDocument({
          generatedAt: completedAt,
          monitoringStartedAt,
          retentionDays: parsedConfiguration.history.retentionDays,
          services: documentServices,
          stateChanges,
          importedDailyAvailability,
          maintenanceWindows:
            input.currentState?.maintenanceWindows ?? [],
        });
  const responseTimes =
    runMode === "status" && input.currentState !== null
      ? input.currentState.documents.responseTimes
      : createResponseTimesDocument({
          generatedAt: completedAt,
          monitoringStartedAt,
          services: documentServices,
          responseSamples,
        });

  const content: MonitorStateContent = {
    monitoringStartedAt,
    current: { checks, services },
    stateChanges,
    importedDailyAvailability,
    maintenanceWindows: input.currentState?.maintenanceWindows ?? [],
    responseSamples,
    documents: { status, responseTimes },
  };
  let incidents = input.currentIncidents ?? emptyIncidents(completedAt);
  let incidentResult: MonitorActionSummary["incidentResult"] = "unchanged";
  if (runMode === "status") {
    const reconcile = dependencies.reconcileIncidents ?? reconcileGitHubIncidents;
    if (
      dependencies.reconcileIncidents === undefined &&
      dependencies.incidentClient === undefined
    ) {
      throw new MonitorActionError("INCIDENT_CLIENT_REQUIRED");
    }
    const reconciliation = await reconcile(
      {
        generatedAt: completedAt,
        retentionDays: parsedConfiguration.history.retentionDays,
        services: parsedConfiguration.services,
        checkStates: checks,
        incidentLabel: parsedConfiguration.incidents.incidentLabel,
        maintenanceLabel: parsedConfiguration.incidents.maintenanceLabel,
      },
      { client: dependencies.incidentClient! },
    );
    incidents = reconciliation.document;
    incidentResult = "reconciled";
  }
  if (!validateIncidentsDocument(incidents).success) {
    throw new MonitorActionError("INVALID_INCIDENT_DOCUMENT");
  }

  const summary = await report(
    {
      mode: runMode,
      outcome: "prepared",
      availableChecks: observations.filter(
        ({ targetAvailability }) => targetAvailability === "available",
      ).length,
      unavailableChecks: observations.filter(
        ({ targetAvailability }) => targetAvailability === "unavailable",
      ).length,
      incidentResult,
    },
    dependencies.writeSummary,
  );
  return {
    outcome: "prepared",
    run,
    content,
    incidents,
    observations,
    summary,
  };
}
