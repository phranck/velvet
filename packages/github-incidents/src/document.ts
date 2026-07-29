import {
  CONTRACT_SCHEMA_VERSION,
  validateIncidentsDocument,
  type IncidentsDocument,
} from "@velvet/contracts";

import { GitHubIncidentsError } from "./errors.js";
import { parseVelvetMetadata } from "./markers.js";
import { resolveMaintenanceWindow } from "./maintenance.js";
import type {
  GitHubIssue,
  IncidentMetadata,
  MaintenanceService,
} from "./types.js";

export interface CreateIncidentsDocumentInput {
  generatedAt: string;
  services: MaintenanceService[];
  issues: GitHubIssue[];
}

function incidentSummary(
  metadata: IncidentMetadata,
  services: MaintenanceService[],
): string {
  const service = services.find(({ id }) => id === metadata.serviceId);
  const check = service?.checks.find(({ id }) => id === metadata.checkId);
  const serviceName = service?.name ?? metadata.serviceId;
  const checkName = check?.name ?? metadata.checkId;
  return `${checkName} for ${serviceName} reported a confirmed outage.`;
}

function maintenanceTitle(title: string): string {
  const normalized = title.replace(/^\[maintenance\]\s*/iu, "").trim();
  return normalized || "Planned maintenance";
}

function incidentIdentity(metadata: IncidentMetadata): string {
  return `${metadata.serviceId}\u0000${metadata.checkId}\u0000${metadata.transitionAt}`;
}

function normalizedGeneratedAt(input: CreateIncidentsDocumentInput): string {
  let latest = Date.parse(input.generatedAt);
  if (Number.isNaN(latest)) return input.generatedAt;
  for (const issue of input.issues) {
    if (issue.state !== "closed" || issue.closedAt === null) continue;
    const metadata = parseVelvetMetadata(issue.body);
    if (metadata === null) continue;
    const closedAt = Date.parse(issue.closedAt);
    if (!Number.isNaN(closedAt) && closedAt > latest) latest = closedAt;
  }
  return new Date(latest).toISOString();
}

export function createIncidentsDocument(
  input: CreateIncidentsDocumentInput,
): IncidentsDocument {
  const events: IncidentsDocument["events"] = [];
  const generatedAt = normalizedGeneratedAt(input);
  const primaryIncidents = new Map<string, GitHubIssue>();
  for (const issue of input.issues) {
    const metadata = parseVelvetMetadata(issue.body);
    if (metadata?.kind !== "incident") continue;
    const identity = incidentIdentity(metadata);
    const current = primaryIncidents.get(identity);
    if (
      current === undefined ||
      (issue.state === "open" && current.state === "closed") ||
      (issue.state === current.state && issue.number < current.number)
    ) {
      primaryIncidents.set(identity, issue);
    }
  }

  for (const issue of [...input.issues].sort(
    (left, right) => left.number - right.number,
  )) {
    const metadata = parseVelvetMetadata(issue.body);
    if (metadata?.kind === "incident") {
      if (
        primaryIncidents.get(incidentIdentity(metadata))?.number !== issue.number
      ) {
        continue;
      }
      events.push({
        id: `incident-${issue.number}`,
        kind: "incident",
        state: issue.state === "open" ? "open" : "resolved",
        title: issue.title,
        summary: incidentSummary(metadata, input.services),
        affectedServiceIds: [metadata.serviceId],
        startsAt: metadata.startedAt,
        endsAt: issue.state === "open" ? null : issue.closedAt,
      });
      continue;
    }

    if (metadata?.kind === "maintenance") {
      const window = resolveMaintenanceWindow(metadata, issue);
      if (window === null) continue;
      const generatedAtTimestamp = Date.parse(generatedAt);
      const startsAt = Date.parse(window.startsAt);
      const endsAt = Date.parse(window.endsAt);
      events.push({
        id: `maintenance-${issue.number}`,
        kind: "maintenance",
        state:
          generatedAtTimestamp < startsAt
            ? "scheduled"
            : generatedAtTimestamp < endsAt && issue.state === "open"
              ? "active"
              : "completed",
        title: maintenanceTitle(issue.title),
        summary: window.summary,
        affectedServiceIds: [
          ...new Set(window.targets.map(({ serviceId }) => serviceId)),
        ],
        startsAt: window.startsAt,
        endsAt: window.endsAt,
      });
    }
  }

  events.sort(
    (left, right) =>
      right.startsAt.localeCompare(left.startsAt) ||
      left.id.localeCompare(right.id),
  );
  const document: IncidentsDocument = {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    generatedAt,
    events,
  };
  if (!validateIncidentsDocument(document).success) {
    throw new GitHubIncidentsError("INVALID_INCIDENT_DOCUMENT");
  }
  return document;
}
