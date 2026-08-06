export interface IncidentMetadata {
  schemaVersion: 1;
  kind: "incident";
  serviceId: string;
  checkId: string;
  transitionAt: string;
  startedAt: string;
}

export interface MaintenanceTarget {
  serviceId: string;
  checkId: string | null;
}

export interface MaintenanceMetadata {
  schemaVersion: 1;
  kind: "maintenance";
  targets: MaintenanceTarget[];
  startsAt: string;
  endsAt: string;
  summary: string;
}

export type VelvetIssueMetadata = IncidentMetadata | MaintenanceMetadata;

export interface MaintenanceService {
  id: string;
  name: string;
  checks: Array<{ id: string; name: string }>;
}

export type MaintenanceValidationErrorCode =
  | "DUPLICATE_MAINTENANCE_TARGET"
  | "INVALID_MAINTENANCE_TIMESTAMP"
  | "INVALID_MAINTENANCE_WINDOW"
  | "MISSING_MAINTENANCE_FIELD"
  | "UNKNOWN_MAINTENANCE_TARGET";

export interface MaintenanceValidationError {
  code: MaintenanceValidationErrorCode;
  field: string;
  message: string;
}

export type MaintenanceParseResult =
  | { success: true; data: MaintenanceMetadata }
  | { success: false; errors: MaintenanceValidationError[] };

export type GitHubIncidentsOperation =
  | "create-comment"
  | "create-issue"
  | "create-label"
  | "get-label"
  | "list-comments"
  | "list-issues"
  | "update-issue";

export interface GitHubIncidentErrorLogRecord {
  operation: string;
  result: "failed";
  code: string;
  errorId: string;
  status: number | null;
}

export type FetchImplementation = (
  ...args: Parameters<typeof globalThis.fetch>
) => ReturnType<typeof globalThis.fetch>;

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  labels: string[];
  /**
   * How the author relates to the repository, as GitHub reports it.
   *
   * One of `OWNER`, `MEMBER`, `COLLABORATOR`, `CONTRIBUTOR`, `FIRST_TIMER`,
   * `FIRST_TIME_CONTRIBUTOR`, `MANNEQUIN`, or `NONE`. The first three have write
   * access; the rest do not. A maintenance issue is only honoured from an author
   * with write access, because a maintenance window suppresses incident
   * reporting and a public repository lets anyone open an issue.
   */
  authorAssociation: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubLabelInput {
  name: string;
  color: string;
  description: string;
}

export interface GitHubIssueCreateInput {
  title: string;
  body: string;
  labels: string[];
}

export interface GitHubIssueUpdateInput {
  title?: string;
  body?: string;
  state?: "open" | "closed";
}

export interface GitHubIssuesClient {
  listIssues(label: string): Promise<GitHubIssue[]>;
  listComments(issueNumber: number): Promise<GitHubComment[]>;
  ensureLabel(input: GitHubLabelInput): Promise<void>;
  createIssue(input: GitHubIssueCreateInput): Promise<GitHubIssue>;
  updateIssue(
    issueNumber: number,
    input: GitHubIssueUpdateInput,
  ): Promise<GitHubIssue>;
  createComment(issueNumber: number, body: string): Promise<GitHubComment>;
}

export interface GitHubIssuesClientOptions {
  owner: string;
  repo: string;
  token: string;
  apiBaseUrl?: string;
  fetch?: FetchImplementation;
  createErrorId?: () => string;
}
