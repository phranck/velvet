import { createHash } from "node:crypto";

import type { IncidentsDocument } from "@velvet/contracts";
import type { MonitorCheckState } from "@velvet/monitor";

import { createIncidentsDocument } from "./document.js";
import {
  GitHubIncidentsError,
  githubIncidentErrorLog,
} from "./errors.js";
import {
  hasActionMarker,
  parseVelvetMetadata,
  removeVelvetMetadata,
  serializeActionMarker,
  serializeVelvetMetadata,
  upsertVelvetMetadata,
} from "./markers.js";
import {
  maintenanceCovers,
  parseMaintenanceIssueBody,
  resolveMaintenanceWindow,
} from "./maintenance.js";
import type {
  GitHubComment,
  GitHubIncidentErrorLogRecord,
  GitHubIssue,
  GitHubIssuesClient,
  GitHubIncidentsOperation,
  IncidentMetadata,
  MaintenanceMetadata,
  MaintenanceService,
} from "./types.js";

export interface ReconcileGitHubIncidentsInput {
  generatedAt: string;
  retentionDays: number;
  services: MaintenanceService[];
  checkStates: MonitorCheckState[];
  incidentLabel: string;
  maintenanceLabel: string;
}

export interface ReconcileGitHubIncidentsDependencies {
  client: GitHubIssuesClient;
  logger?: (record: GitHubIncidentErrorLogRecord) => void;
}

export interface ReconcileGitHubIncidentsResult {
  document: IncidentsDocument;
}

interface NormalizedMaintenanceIssue {
  issue: GitHubIssue;
  metadata: MaintenanceMetadata;
}

/**
 * The author relationships that carry write access to a repository.
 *
 * Every issue Velvet reads is filtered by this before anything else looks at
 * it, because a public repository lets anyone open one and an issue template
 * applies its own labels whatever the author's rights. Two separate abuses
 * follow from trusting one: a maintenance window suppresses incident
 * reporting, and a body carrying a Velvet metadata marker is published as an
 * incident. The marker is an unsigned comment, so it is trustworthy only for as
 * long as only trusted authors can place one.
 *
 * Everyone else reads as `CONTRIBUTOR`, `NONE`, or similar. Velvet's own issues
 * are written with the repository token and read as `OWNER`.
 */
const TRUSTED_ISSUE_AUTHORS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * Keeps only the issues whose author has write access.
 *
 * Applied where issues are loaded rather than at each use, so every later
 * consumer inherits it, including the published incidents document and
 * anything added afterwards.
 *
 * @param issues - Issues exactly as GitHub listed them.
 * @returns Those Velvet is willing to act on.
 */
function fromTrustedAuthors(issues: GitHubIssue[]): GitHubIssue[] {
  return issues.filter((issue) =>
    TRUSTED_ISSUE_AUTHORS.has(issue.authorAssociation),
  );
}

function actionTimestamp(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function incidentIdentity(metadata: IncidentMetadata): string {
  return `${metadata.serviceId}\u0000${metadata.checkId}\u0000${metadata.transitionAt}`;
}

function targetIdentity(serviceId: string, checkId: string): string {
  return `${serviceId}\u0000${checkId}`;
}

/**
 * Names what is down, in the words somebody reads in their issue list.
 *
 * A service given a single `url` takes its check's name from itself, so naming
 * both repeats the same word twice. The check is named only where it says
 * something the service has not already said.
 */
function incidentTitle(
  service: MaintenanceService,
  check: { id: string; name: string },
): string {
  const subject =
    check.name === service.name ? service.name : `${service.name} / ${check.name}`;
  return `${subject} is unavailable`;
}

function incidentBody(
  service: MaintenanceService,
  check: { id: string; name: string },
  metadata: IncidentMetadata,
): string {
  return `Velvet confirmed that **${check.name}** for **${service.name}** is unavailable.\n\nDetected at: ${metadata.startedAt}\n\n${serializeVelvetMetadata(metadata)}`;
}

function validationComment(
  issueNumber: number,
  source: string,
  errors: Array<{ field: string; message: string }>,
): { actionId: string; body: string } {
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  const actionId = `maintenance-validation:${issueNumber}:${hash}`;
  return {
    actionId,
    body: `Velvet could not schedule this maintenance:\n\n${errors
      .map(({ field, message }) => `- **${field}**: ${message}`)
      .join("\n")}\n\nUpdate the issue fields and Velvet will check them again.`,
  };
}

export async function reconcileGitHubIncidents(
  input: ReconcileGitHubIncidentsInput,
  dependencies: ReconcileGitHubIncidentsDependencies,
): Promise<ReconcileGitHubIncidentsResult> {
  const { client, logger } = dependencies;
  const perform = async <T>(
    operation: GitHubIncidentsOperation,
    action: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await action();
    } catch (cause) {
      const error =
        cause instanceof GitHubIncidentsError
          ? cause
          : new GitHubIncidentsError("GITHUB_REQUEST_FAILED", { cause });
      logger?.(githubIncidentErrorLog(operation, error));
      throw error;
    }
  };

  await perform("create-label", () =>
    client.ensureLabel({
      name: input.incidentLabel,
      color: "d73a4a",
      description: "Velvet confirmed incident",
    }),
  );
  await perform("create-label", () =>
    client.ensureLabel({
      name: input.maintenanceLabel,
      color: "fbca04",
      description: "Velvet planned maintenance",
    }),
  );

  // Filtered here, at the door, so nothing downstream has to remember to. An
  // issue from an untrusted author never enters the map, is never parsed, is
  // never commented on, and cannot reach the published document.
  const listedIncidents = fromTrustedAuthors(
    await perform("list-issues", () => client.listIssues(input.incidentLabel)),
  );
  const listedMaintenance = fromTrustedAuthors(
    await perform("list-issues", () =>
      client.listIssues(input.maintenanceLabel),
    ),
  );
  const issues = new Map<number, GitHubIssue>();
  [...listedIncidents, ...listedMaintenance].forEach((issue) => {
    issues.set(issue.number, issue);
  });
  const comments = new Map<number, GitHubComment[]>();

  const issueComments = async (issueNumber: number): Promise<GitHubComment[]> => {
    const cached = comments.get(issueNumber);
    if (cached !== undefined) return cached;
    const loaded = await perform("list-comments", () =>
      client.listComments(issueNumber),
    );
    comments.set(issueNumber, loaded);
    return loaded;
  };

  const ensureComment = async (
    issueNumber: number,
    actionId: string,
    body: string,
  ): Promise<void> => {
    const existing = await issueComments(issueNumber);
    if (existing.some((comment) => hasActionMarker(comment.body, actionId))) {
      return;
    }
    const created = await perform("create-comment", () =>
      client.createComment(
        issueNumber,
        `${body}\n\n${serializeActionMarker(actionId)}`,
      ),
    );
    existing.push(created);
  };

  const updateIssue = async (
    issueNumber: number,
    update: Parameters<GitHubIssuesClient["updateIssue"]>[1],
  ): Promise<GitHubIssue> => {
    const updated = await perform("update-issue", () =>
      client.updateIssue(issueNumber, update),
    );
    issues.set(issueNumber, updated);
    return updated;
  };

  const maintenanceIssues: NormalizedMaintenanceIssue[] = [];
  for (const listedIssue of listedMaintenance) {
    let issue = issues.get(listedIssue.number)!;
    // Already excluded at the door, kept as a second line so that removing the
    // filter above cannot silently re-open maintenance to strangers.
    if (!TRUSTED_ISSUE_AUTHORS.has(issue.authorAssociation)) continue;
    let metadata = parseVelvetMetadata(issue.body);
    if (issue.state === "open") {
      const humanBody = removeVelvetMetadata(issue.body);
      const parsed = parseMaintenanceIssueBody(humanBody, input.services);
      if (!parsed.success) {
        if (metadata?.kind === "maintenance" && humanBody !== issue.body) {
          issue = await updateIssue(issue.number, { body: humanBody });
        }
        const validation = validationComment(
          issue.number,
          humanBody,
          parsed.errors,
        );
        await ensureComment(
          issue.number,
          validation.actionId,
          validation.body,
        );
        continue;
      }

      metadata = parsed.data;
      const normalizedBody = upsertVelvetMetadata(humanBody, metadata);
      if (normalizedBody !== issue.body) {
        issue = await updateIssue(issue.number, { body: normalizedBody });
      }
      if (Date.parse(input.generatedAt) >= Date.parse(metadata.endsAt)) {
        const actionId = `maintenance:${issue.number}:${actionTimestamp(metadata.endsAt)}:completed`;
        await ensureComment(
          issue.number,
          actionId,
          "Velvet marked this planned maintenance as completed.",
        );
        issue = await updateIssue(issue.number, { state: "closed" });
      }
    }

    if (metadata?.kind !== "maintenance") continue;
    const window = resolveMaintenanceWindow(metadata, issue);
    if (window !== null) {
      maintenanceIssues.push({ issue, metadata: window });
    }
  }

  const incidentIssues = (): Array<{
    issue: GitHubIssue;
    metadata: IncidentMetadata;
  }> =>
    [...issues.values()].flatMap((issue) => {
      const metadata = parseVelvetMetadata(issue.body);
      return metadata?.kind === "incident" ? [{ issue, metadata }] : [];
    });

  for (const state of input.checkStates) {
    if (state.confirmedStatus === null || state.confirmedAt === null) continue;
    const service = input.services.find(({ id }) => id === state.serviceId);
    const check = service?.checks.find(({ id }) => id === state.checkId);
    if (service === undefined || check === undefined) continue;
    const target = targetIdentity(state.serviceId, state.checkId);

    if (state.confirmedStatus === "up") {
      const matching = incidentIssues().filter(
        ({ issue, metadata }) =>
          issue.state === "open" &&
          targetIdentity(metadata.serviceId, metadata.checkId) === target,
      );
      for (const { issue } of matching) {
        const actionId = `incident:${issue.number}:${actionTimestamp(state.confirmedAt)}:resolved`;
        await ensureComment(
          issue.number,
          actionId,
          `Velvet confirmed recovery at ${state.confirmedAt}.`,
        );
        await updateIssue(issue.number, { state: "closed" });
      }
      continue;
    }

    const transitionIdentity = `${state.serviceId}\u0000${state.checkId}\u0000${state.confirmedAt}`;
    const openTargetIncidents = incidentIssues()
      .filter(
        ({ issue, metadata }) =>
          issue.state === "open" &&
          targetIdentity(metadata.serviceId, metadata.checkId) === target,
      )
      .sort((left, right) => left.issue.number - right.issue.number);
    if (openTargetIncidents.length > 0) {
      const primary = openTargetIncidents[0]!;
      for (const duplicate of openTargetIncidents.slice(1)) {
        const actionId = `incident:${duplicate.issue.number}:duplicate-of-${primary.issue.number}`;
        await ensureComment(
          duplicate.issue.number,
          actionId,
          `Velvet identified this as a duplicate of incident #${primary.issue.number} and is closing it without deleting its history.`,
        );
        await updateIssue(duplicate.issue.number, { state: "closed" });
      }
      continue;
    }
    const transitionIncidents = incidentIssues().filter(
      ({ metadata }) => incidentIdentity(metadata) === transitionIdentity,
    );
    if (transitionIncidents.length > 0) {
      const primary = transitionIncidents.sort(
        (left, right) =>
          Number(right.issue.state === "open") -
            Number(left.issue.state === "open") ||
          left.issue.number - right.issue.number,
      )[0]!;
      for (const duplicate of transitionIncidents.slice(1)) {
        if (duplicate.issue.state === "closed") continue;
        const actionId = `incident:${duplicate.issue.number}:duplicate-of-${primary.issue.number}`;
        await ensureComment(
          duplicate.issue.number,
          actionId,
          `Velvet identified this as a duplicate of incident #${primary.issue.number} and is closing it without deleting its history.`,
        );
        await updateIssue(duplicate.issue.number, { state: "closed" });
      }
      if (primary.issue.state === "closed") {
        const actionId = `incident:${primary.issue.number}:${actionTimestamp(state.confirmedAt)}:reopened`;
        await ensureComment(
          primary.issue.number,
          actionId,
          `Velvet still confirms this outage at ${input.generatedAt}, so the incident is being reopened.`,
        );
        await updateIssue(primary.issue.number, { state: "open" });
      }
      continue;
    }

    const coveringMaintenance = maintenanceIssues.filter(({ metadata }) =>
      maintenanceCovers(
        metadata,
        state.serviceId,
        state.checkId,
        state.confirmedAt!,
      ),
    );
    if (
      coveringMaintenance.some(({ metadata }) =>
        maintenanceCovers(
          metadata,
          state.serviceId,
          state.checkId,
          input.generatedAt,
        ),
      )
    ) {
      continue;
    }
    const startedAt = coveringMaintenance.reduce(
      (latest, { metadata }) =>
        metadata.endsAt > latest ? metadata.endsAt : latest,
      state.confirmedAt,
    );
    const metadata: IncidentMetadata = {
      schemaVersion: 1,
      kind: "incident",
      serviceId: state.serviceId,
      checkId: state.checkId,
      transitionAt: state.confirmedAt,
      startedAt,
    };
    const created = await perform("create-issue", () =>
      client.createIssue({
        title: incidentTitle(service, check),
        body: incidentBody(service, check, metadata),
        labels: [input.incidentLabel],
      }),
    );
    issues.set(created.number, created);
  }

  return {
    document: createIncidentsDocument({
      generatedAt: input.generatedAt,
      retentionDays: input.retentionDays,
      services: input.services,
      issues: [...issues.values()],
    }),
  };
}
