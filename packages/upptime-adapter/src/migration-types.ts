import type { MonitorPersistentState } from "@velvet/monitor";

import type { VelvetDocuments } from "./types.js";

export interface UpptimeMigrationSource {
  repository: string;
  ref: string;
  commit: string;
  committedAt: string;
}

export interface UpptimeMigrationOmission {
  code: string;
  source: string;
  message: string;
  serviceId?: string;
}

export interface UpptimeMigrationFinding {
  code: string;
  source: string;
  message: string;
  serviceId?: string;
}

export interface UpptimeMigrationRequiredSecret {
  environmentVariable: string;
  githubSecret: string;
  workflowValue: string;
  serviceId: string;
  header: string;
  sourceSecretNames: string[];
}

export interface UpptimeMigrationIssueSource {
  number: number;
  url: string;
  kind: "incident" | "maintenance";
}

export interface UpptimeMigrationReport {
  schemaVersion: 1;
  source: UpptimeMigrationSource & { issuesDigest: string };
  summary: {
    migratedServices: number;
    importedAvailabilityDays: number;
    responseSamples: number;
    incidents: number;
    maintenanceWindows: number;
    omissions: number;
    requiredSecrets: number;
  };
  omissions: UpptimeMigrationOmission[];
  findings: UpptimeMigrationFinding[];
  requiredSecrets: UpptimeMigrationRequiredSecret[];
  issueSources: UpptimeMigrationIssueSource[];
  workflowChanges: string[];
}

export interface UpptimeMigrationResult {
  configurationYaml: string;
  state: MonitorPersistentState;
  documents: VelvetDocuments;
  report: UpptimeMigrationReport;
  reportMarkdown: string;
}
