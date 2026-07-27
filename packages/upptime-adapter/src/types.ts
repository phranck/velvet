import type {
  IncidentsDocument,
  ResponseTimesDocument,
  StatusDocument,
} from "@velvet/contracts";

export interface UpptimeCommit {
  sha: string;
  committedAt: string;
  message: string;
}

export interface UpptimeIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
  labels: string[];
}

export interface UpptimeSnapshot {
  configYaml: string;
  summaryJson: string;
  histories: Record<string, string>;
  commits: Record<string, UpptimeCommit[]>;
  issues: UpptimeIssue[];
}

export interface VelvetDocuments {
  status: StatusDocument;
  responseTimes: ResponseTimesDocument;
  incidents: IncidentsDocument;
}
