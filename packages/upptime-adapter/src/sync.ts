import { convertUpptimeSnapshot } from "./conversion.js";
import type { VelvetDocumentTimestamps } from "./conversion.js";
import { UpptimeAdapterError } from "./errors.js";
import { loadUpptimeSnapshot } from "./github.js";
import { materializeVelvetDocuments } from "./materialization.js";
import type { UpptimeSnapshot } from "./types.js";

export interface SyncVelvetDataOptions {
  repository: string;
  ref?: string;
  outputDirectory: string;
  generatedAt?: string;
  token?: string;
  apiBaseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export async function syncVelvetData(
  options: SyncVelvetDataOptions,
): Promise<void> {
  const repositoryParts = options.repository.split("/");
  const owner = repositoryParts[0];
  const repo = repositoryParts[1];
  if (
    repositoryParts.length !== 2 ||
    owner === undefined ||
    owner.length === 0 ||
    repo === undefined ||
    repo.length === 0
  ) {
    throw new UpptimeAdapterError(
      "INVALID_INPUT",
      `Invalid GitHub repository ${options.repository}`,
    );
  }

  const snapshot = await loadUpptimeSnapshot({
    owner,
    repo,
    ...(options.ref === undefined ? {} : { ref: options.ref }),
    ...(options.token === undefined ? {} : { token: options.token }),
    ...(options.apiBaseUrl === undefined
      ? {}
      : { apiBaseUrl: options.apiBaseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const documents = convertUpptimeSnapshot(snapshot, {
    generatedAt: options.generatedAt ?? latestSnapshotTimestamps(snapshot),
  });
  await materializeVelvetDocuments(options.outputDirectory, documents);
}

function latestSnapshotTimestamps(
  snapshot: UpptimeSnapshot,
): VelvetDocumentTimestamps {
  const monitoringTimestamps = Object.values(snapshot.commits).flatMap(
    (commits) => commits.map(({ committedAt }) => committedAt),
  );
  const incidentTimestamps = snapshot.issues.flatMap(
    ({ createdAt, closedAt }) =>
      closedAt === null ? [createdAt] : [createdAt, closedAt],
  );
  const monitoringTimestamp = latestTimestamp(monitoringTimestamps);
  if (monitoringTimestamp === undefined) {
    throw new UpptimeAdapterError(
      "PARTIAL_UPSTREAM_DATA",
      "Upptime source has no usable snapshot timestamp",
    );
  }
  const incidentsTimestamp = latestTimestamp([
    ...monitoringTimestamps,
    ...incidentTimestamps,
  ]);
  const monitoringGeneratedAt = new Date(monitoringTimestamp).toISOString();
  return {
    status: monitoringGeneratedAt,
    responseTimes: monitoringGeneratedAt,
    incidents: new Date(incidentsTimestamp ?? monitoringTimestamp).toISOString(),
  };
}

function latestTimestamp(values: string[]): number | undefined {
  const timestamp = Math.max(...values.map((value) => Date.parse(value)));
  return Number.isFinite(timestamp) ? timestamp : undefined;
}
