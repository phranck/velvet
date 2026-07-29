import { GitHubIncidentsError } from "./errors.js";
import type {
  IncidentMetadata,
  MaintenanceMetadata,
  MaintenanceTarget,
  VelvetIssueMetadata,
} from "./types.js";

const METADATA_PATTERN = /<!-- velvet-metadata:(\{[^\r\n]*\}) -->/gu;
const ANY_METADATA_PATTERN = /\n*<!-- velvet-metadata:[\s\S]*? -->\n*/gu;
const ACTION_ID = /^[a-z0-9](?:[a-z0-9:.-]*[a-z0-9])?$/u;
const IDENTIFIER = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: string[],
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    IDENTIFIER.test(value)
  );
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isMaintenanceTarget(value: unknown): value is MaintenanceTarget {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["serviceId", "checkId"]) &&
    isIdentifier(value.serviceId) &&
    (value.checkId === null || isIdentifier(value.checkId))
  );
}

function isIncidentMetadata(value: unknown): value is IncidentMetadata {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "schemaVersion",
      "kind",
      "serviceId",
      "checkId",
      "transitionAt",
      "startedAt",
    ]) &&
    value.schemaVersion === 1 &&
    value.kind === "incident" &&
    isIdentifier(value.serviceId) &&
    isIdentifier(value.checkId) &&
    isTimestamp(value.transitionAt) &&
    isTimestamp(value.startedAt) &&
    Date.parse(value.startedAt) >= Date.parse(value.transitionAt)
  );
}

function isMaintenanceMetadata(value: unknown): value is MaintenanceMetadata {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "kind",
      "targets",
      "startsAt",
      "endsAt",
      "summary",
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== "maintenance" ||
    !Array.isArray(value.targets) ||
    value.targets.length === 0 ||
    !value.targets.every(isMaintenanceTarget) ||
    !isTimestamp(value.startsAt) ||
    !isTimestamp(value.endsAt) ||
    typeof value.summary !== "string" ||
    value.summary.length === 0 ||
    value.summary.length > 2_000 ||
    Date.parse(value.startsAt) >= Date.parse(value.endsAt)
  ) {
    return false;
  }

  const identities = value.targets.map(
    ({ serviceId, checkId }) => `${serviceId}\u0000${checkId ?? "*"}`,
  );
  return new Set(identities).size === identities.length;
}

function isVelvetIssueMetadata(value: unknown): value is VelvetIssueMetadata {
  return isIncidentMetadata(value) || isMaintenanceMetadata(value);
}

export function serializeVelvetMetadata(
  metadata: VelvetIssueMetadata,
): string {
  if (!isVelvetIssueMetadata(metadata)) {
    throw new GitHubIncidentsError("INVALID_METADATA");
  }
  return `<!-- velvet-metadata:${JSON.stringify(metadata)} -->`;
}

export function parseVelvetMetadata(
  source: string,
): VelvetIssueMetadata | null {
  const matches = [...source.matchAll(METADATA_PATTERN)];
  if (matches.length !== 1 || (matches[0]?.[1]?.length ?? 0) > 16_384) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(matches[0]![1]!);
    return isVelvetIssueMetadata(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function upsertVelvetMetadata(
  body: string,
  metadata: VelvetIssueMetadata,
): string {
  const humanBody = body.replace(ANY_METADATA_PATTERN, "\n").trimEnd();
  return `${humanBody}${humanBody ? "\n\n" : ""}${serializeVelvetMetadata(metadata)}`;
}

export function removeVelvetMetadata(body: string): string {
  return body.replace(ANY_METADATA_PATTERN, "\n").trimEnd();
}

export function serializeActionMarker(actionId: string): string {
  if (actionId.length > 160 || !ACTION_ID.test(actionId)) {
    throw new GitHubIncidentsError("INVALID_METADATA");
  }
  return `<!-- velvet-action:${actionId} -->`;
}

export function hasActionMarker(body: string, actionId: string): boolean {
  try {
    return body.includes(serializeActionMarker(actionId));
  } catch {
    return false;
  }
}
