import {
  convertUpptimeSnapshot,
  deriveVelvetDocumentTimestamps,
} from "./conversion.js";
import { UpptimeAdapterError } from "./errors.js";
import type { FetchImplementation } from "./fetch.js";
import { loadUpptimeSnapshot } from "./github.js";
import { materializeVelvetDocuments } from "./materialization.js";

export interface SyncVelvetDataOptions {
  repository: string;
  ref?: string;
  outputDirectory: string;
  generatedAt?: string;
  token?: string;
  apiBaseUrl?: string;
  fetch?: FetchImplementation;
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
    generatedAt: options.generatedAt ?? deriveVelvetDocumentTimestamps(snapshot),
  });
  await materializeVelvetDocuments(options.outputDirectory, documents);
}
