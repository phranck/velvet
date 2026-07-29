import { appendFile } from "node:fs/promises";

import type { MonitorActionSummary } from "./runner.js";

export interface ActionSummary extends MonitorActionSummary {
  commitOutcome: "written" | "duplicate" | "stale" | "failed";
}

export interface ActionFailureSummary {
  mode: MonitorActionSummary["mode"] | "unknown";
  code: string;
  errorId: string;
}

export async function writeActionSummary(
  path: string | undefined,
  summary: ActionSummary,
): Promise<void> {
  if (path === undefined || path === "") return;
  const source =
    "## Velvet monitor\n\n" +
    "| Result | Value |\n" +
    "| --- | --- |\n" +
    `| Mode | ${summary.mode} |\n` +
    `| Run | ${summary.outcome} |\n` +
    `| Available checks | ${summary.availableChecks} |\n` +
    `| Unavailable checks | ${summary.unavailableChecks} |\n` +
    `| Incidents | ${summary.incidentResult} |\n` +
    `| Data commit | ${summary.commitOutcome} |\n`;
  await appendFile(path, source, "utf8");
}

export async function writeActionFailureSummary(
  path: string | undefined,
  summary: ActionFailureSummary,
): Promise<void> {
  if (path === undefined || path === "") return;
  const source =
    "## Velvet monitor\n\n" +
    "| Result | Value |\n" +
    "| --- | --- |\n" +
    `| Mode | ${summary.mode} |\n` +
    "| Run | failed |\n" +
    `| Error | ${summary.code} |\n` +
    `| Error ID | ${summary.errorId} |\n` +
    "| Data commit | failed |\n";
  await appendFile(path, source, "utf8");
}
