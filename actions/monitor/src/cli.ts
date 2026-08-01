import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseVelvetConfiguration } from "@velvet/contracts";
import {
  createGitHubIssuesClient,
  GitHubIncidentsError,
} from "@velvet/github-incidents";

import {
  loadDataBranch,
  publishDataBranch,
  type DataBranchSnapshot,
  type PublishDataBranchResult,
} from "./data-branch.js";
import { MonitorActionError } from "./errors.js";
import {
  runMonitorAction,
  type MonitorActionDependencies,
  type MonitorActionInput,
  type MonitorActionResult,
  type PreparedMonitorActionResult,
} from "./runner.js";
import {
  writeActionFailureSummary,
  writeActionSummary,
  type ActionSummary,
} from "./summary.js";

type Environment = Record<string, string | undefined>;

export interface MonitorCliDependencies {
  loadDataBranch?: typeof loadDataBranch;
  publishDataBranch?: typeof publishDataBranch;
  runMonitorAction?: typeof runMonitorAction;
  createIncidentClient?: typeof createGitHubIssuesClient;
  writeActionSummary?: typeof writeActionSummary;
}

function required(environment: Environment, name: string): string {
  const value = environment[name];
  if (value === undefined || value === "") {
    throw new MonitorActionError("INTERNAL_FAILURE");
  }
  return value;
}

function isDataConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "DATA_BRANCH_CONFLICT"
  );
}

function runnerInput(
  base: DataBranchSnapshot,
  input: Omit<MonitorActionInput, "currentState" | "currentIncidents">,
): MonitorActionInput {
  return {
    ...input,
    currentState: base.state,
    currentIncidents: base.incidents,
  };
}

async function preparedRun(
  runAction: typeof runMonitorAction,
  input: MonitorActionInput,
  dependencies: MonitorActionDependencies,
): Promise<MonitorActionResult> {
  return runAction(input, {
    ...dependencies,
    writeSummary: async () => undefined,
  });
}

async function publish(
  publishData: typeof publishDataBranch,
  workspace: string,
  base: DataBranchSnapshot,
  prepared: PreparedMonitorActionResult,
  retentionDays: number,
): Promise<PublishDataBranchResult> {
  return publishData(workspace, base, {
    run: prepared.run,
    content: prepared.content,
    incidents: prepared.incidents,
    retentionDays,
  });
}

export async function runMonitorCli(
  environment: Environment = process.env,
  dependencies: MonitorCliDependencies = {},
): Promise<ActionSummary> {
  const mode = required(environment, "VELVET_MODE");
  if (mode !== "status" && mode !== "response") {
    throw new MonitorActionError("INVALID_MODE");
  }
  const workspace = required(environment, "VELVET_WORKSPACE");
  const repository = required(environment, "GITHUB_REPOSITORY");
  const runId = `${required(environment, "GITHUB_RUN_ID")}:${mode}`;
  // Reading and parsing fail for unrelated reasons and are reported as
  // separate codes. Sharing one made a diagnosis impossible: a run that could
  // not find the file looked exactly like a run whose configuration the schema
  // refused, which sent the investigation of issue 145 down the wrong path
  // twice.
  const configurationSource = await readFile(
    join(workspace, "velvet.yml"),
    "utf8",
  ).catch((cause) => {
    throw new MonitorActionError("CONFIGURATION_UNREADABLE", { cause });
  });
  const parsed = parseVelvetConfiguration(configurationSource);
  if (!parsed.success) {
    throw new MonitorActionError("INVALID_CONFIGURATION", {
      // The validator knows which path it rejected, and discarding it was what
      // left "the configuration is invalid" as the whole report.
      ...(parsed.errors[0]?.path ? { detail: parsed.errors[0].path } : {}),
    });
  }
  if (
    `${parsed.data.repository.owner}/${parsed.data.repository.name}` !==
    repository
  ) {
    throw new MonitorActionError("REPOSITORY_MISMATCH");
  }

  const loadData = dependencies.loadDataBranch ?? loadDataBranch;
  const publishData = dependencies.publishDataBranch ?? publishDataBranch;
  const runAction = dependencies.runMonitorAction ?? runMonitorAction;
  const createIncidentClient =
    dependencies.createIncidentClient ?? createGitHubIssuesClient;
  const summaryWriter =
    dependencies.writeActionSummary ?? writeActionSummary;
  const incidentClient =
    mode === "status"
      ? createIncidentClient({
          owner: parsed.data.repository.owner,
          repo: parsed.data.repository.name,
          token: required(environment, "GITHUB_TOKEN"),
          ...(environment.GITHUB_API_URL === undefined
            ? {}
            : { apiBaseUrl: environment.GITHUB_API_URL }),
        })
      : undefined;
  const commonInput = {
    mode,
    runId,
    repository,
    configurationSource,
  };
  let base = await loadData(workspace);
  let result = await preparedRun(
    runAction,
    runnerInput(base, commonInput),
    incidentClient === undefined ? {} : { incidentClient },
  );
  let commitOutcome: ActionSummary["commitOutcome"];

  if (result.outcome === "prepared") {
    try {
      const published = await publish(
        publishData,
        workspace,
        base,
        result,
        parsed.data.history.retentionDays,
      );
      commitOutcome = published.outcome;
    } catch (error) {
      if (!isDataConflict(error)) throw error;
      const observations = result.observations;
      base = await loadData(workspace);
      result = await preparedRun(
        runAction,
        runnerInput(base, commonInput),
        {
          executeChecks: async () => observations,
          ...(incidentClient === undefined ? {} : { incidentClient }),
        },
      );
      if (result.outcome === "prepared") {
        const published = await publish(
          publishData,
          workspace,
          base,
          result,
          parsed.data.history.retentionDays,
        );
        commitOutcome = published.outcome;
      } else {
        commitOutcome = result.outcome;
      }
    }
  } else {
    commitOutcome = result.outcome;
  }

  const summary: ActionSummary = { ...result.summary, commitOutcome };
  await summaryWriter(environment.GITHUB_STEP_SUMMARY, summary);
  return summary;
}

function safeError(error: unknown): MonitorActionError | GitHubIncidentsError {
  if (
    error instanceof MonitorActionError ||
    error instanceof GitHubIncidentsError
  ) {
    return error;
  }
  return new MonitorActionError("INTERNAL_FAILURE", { cause: error });
}

if (import.meta.main) {
  runMonitorCli().catch(async (cause) => {
    const error = safeError(cause);
    const detail = error instanceof MonitorActionError ? error.detail : null;
    await writeActionFailureSummary(process.env.GITHUB_STEP_SUMMARY, {
      mode:
        process.env.VELVET_MODE === "status" ||
        process.env.VELVET_MODE === "response"
          ? process.env.VELVET_MODE
          : "unknown",
      code: error.code,
      errorId: error.errorId,
      ...(detail ? { detail } : {}),
    }).catch(() => undefined);
    console.error(
      JSON.stringify({
        operation: "monitor-action",
        result: "failed",
        code: error.code,
        errorId: error.errorId,
        detail,
        status:
          error instanceof GitHubIncidentsError
            ? (error.status ?? null)
            : null,
      }),
    );
    process.exitCode = 1;
  });
}
